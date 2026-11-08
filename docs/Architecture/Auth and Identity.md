---
status: current
summary: Sessions, cookies, memberships, impersonation, SSO path
created: 2026-10-09
updated: 2026-10-30
tags: [fleetco, architecture, auth, identity, sso, security]
source: Claude Code (Xerro)
---

## Overview

Authentication, session management, and the path to enterprise SSO. Separate from
[[Tenancy Model]], which covers *authorization* — what a principal is allowed to see once
authenticated.

**Core decisions: authentication sits behind a port we own. Better Auth is the first adapter.
Sessions are opaque tokens in our own Postgres, not JWTs. The identity model is built
SSO-ready on day one, but SSO itself is deferred.**

## Authentication Is Not Authorization

Worth stating plainly, because conflating them is how multi-tenant products leak data.

| | Question | Who owns it |
|---|---|---|
| **Authentication** | Who is this person? | A library (Better Auth) behind our port |
| **Authorization** | What rows may they see? | **Entirely our code.** No library models our tenancy. |

Our hard problem is the second one — three planes, portal users scoped to one `customer_id`
inside one `tenant_id`. No auth library expresses that, so we write it regardless of what we
pick for authentication. The library decision only touches the easy half, which is precisely
why it should be made behind a seam and then stopped worrying about.

## The authN Port

Define this in our own code before choosing an implementation. This is the decision that
actually matters architecturally; everything else is an adapter.

```ts
interface Principal {
  userId: string
  tenantId: string
  plane: 'vendor' | 'tenant' | 'portal'
  customerId?: string          // present only for portal principals
  roles: string[]
  authMethod: 'password' | 'sso' | 'api_key' | 'impersonation'
}

interface AuthN {
  authenticate(creds: Credentials): Promise<Principal>
  createSession(userId: string, ctx: SessionContext): Promise<SessionToken>
  validateSession(token: string): Promise<Principal | null>
  revokeSession(token: string): Promise<void>
  revokeAllSessions(userId: string): Promise<void>
}
```

Authorization code depends only on `Principal` and never on how the person authenticated. That
is what makes adding SSO later additive instead of invasive.

## Why Better Auth

A TypeScript library — not a service. It generates tables into **our** Postgres, runs in our
process, has no per-MAU pricing and no network hop. It is a dependency, not a vendor.

**What it gives us that we would otherwise hand-build:**

- The flows with sharp edges: email verification, password reset with single-use expiring
  tokens, change-email with verify-before-switch, change-password with session invalidation,
  session expiry and sliding refresh, signed cookie handling.
- The long tail as plugins: TOTP 2FA with backup codes, passkeys/WebAuthn, magic links,
  email OTP, API keys, rate limiting, and an admin plugin with **impersonation** — which support
  needs and which is genuinely tricky to build safely.
- OAuth/social providers with state and PKCE handling, if ever needed.
- Ongoing security maintenance by someone whose job it is. With a team of 1–3 and no dedicated
  security reviewer, this is worth more than it appears.

**What it costs:**

- **Maturity.** It reached 1.0 in late 2024 and moves quickly; breaking changes have landed
  between minor versions. We inherit someone else's upgrade cadence on our most sensitive path.
- **Schema ownership.** Once production users and sessions live in its tables, replacing it is a
  migration with a cutover, not a refactor. The port limits the blast radius but does not
  eliminate it.
- **Debugging through an abstraction** when a shop cannot log in at 6am. See [[Operations]].

**What it does not give us:** our authorization model, the customer-level scoping the portal
needs, or cross-tenant leak prevention.

### Self-Hosted — Settled

**Better Auth runs as a library in our own process, writing to our own Aurora database.** Settled
by ADR-023, which dropped Neon and with it the managed-auth option that had been under
consideration.

That option is worth remembering as a *test* rather than a product, because it will come up again
with some other vendor. Two conditions had to hold before accepting any managed auth:

1. **The auth HTTP endpoints must execute in our process**, not the vendor's. Otherwise there is a
   network hop and a vendor sitting in the login path — exactly what disqualified Supabase Auth.
2. **We must be able to take ownership of the auth tables' DDL.** Two systems writing schema to one
   database is a real hazard against a bus factor of one.

Self-hosting satisfies both trivially, and the authN port means revisiting this later costs an
adapter rather than a migration.

### Alternatives, and When They Win

| Option | When it becomes the right answer |
|---|---|
| **Hand-rolled** | Never preferred outright, but viable — the provisioned-user surface is small (login, logout, invite-accept, reset, change password, admin disable). The cost is owning 2FA, impersonation, and API keys forever with no reviewer. |
| **Keycloak / Ory Kratos** | If Better Auth's maturity becomes disqualifying. Genuinely battle-tested, speaks OIDC, and Keycloak *realms* map cleanly onto our three planes with separate user pools. Cost: a JVM service to deploy, upgrade, back up, and tune — real ops weight for a small team. |
| **WorkOS** | When the first enterprise customer demands SAML plus SCIM. See the SSO plan below. |
| **Auth0 / Clerk / Stytch** | Not recommended. Per-MAU pricing on a multi-tenant B2B product with a resale ambition gets expensive in exactly the scenario we are hoping for. |

## Sessions: Opaque Tokens, Not JWTs

**Decision: 32 random bytes, base64url-encoded, stored as a SHA-256 hash in a `sessions` table,
delivered as an `httpOnly; Secure; SameSite=Lax` cookie.**

The deciding requirement is **revocation.** When a shop manager fires a technician at 2pm, that
session must be dead at 2:01pm. A stateless JWT cannot be revoked without building a denylist,
at which point you have a sessions table with extra steps and worse ergonomics.

The usual argument for JWTs — avoiding a database lookup per request — is irrelevant here. One
indexed lookup is sub-millisecond in Postgres, trivially cacheable, and we are sizing for tens
of tenants, not millions of requests per second.

Storing the **hash** rather than the token means a database dump does not hand over live
sessions.

**Password hashing: argon2id** (`@node-rs/argon2`), the current OWASP recommendation.

## Cookies and Origins

**Simplified 2026-10-09.** An earlier version of this section defused a hazard created by
subdomain-per-tenant routing: a cookie scoped to a shared parent domain is sent to *every*
subdomain under it, so a session minted for one tenant would arrive at another looking valid.
ADR-018 withdrew subdomains, which removes the bug class rather than mitigating it.

What remains is ordinary and short:

1. **One hostname** — `app.fleetco.com`. No tenant in the URL, so no cross-tenant cookie leakage
   is possible.
2. **Serve the API same-site.** `api.fleetco.com` with the cookie scoped to the shared parent, or
   `/api` proxied through the frontend host. A Vercel frontend plus a Fargate API on unrelated domains
   is cross-origin cookie territory — **decide this before writing the login flow, not after.**
3. **Store `tenant_id` on the session** and verify it on every request. Cheap defense in depth, and
   it means adding tenant resolution later is a routing change rather than a re-architecture.

## Security Checklist

These are the misses that become CVEs. None is difficult; all are easy to skip under deadline
pressure. **Each one gets a test.**

- Password reset tokens: single-use, short expiry, deleted on use
- Invalidate **all** sessions on password change and on email change
- Rate limit login, reset-request, *and* invite-resend — per IP **and** per account
- No user enumeration: identical response whether or not the email exists
- Rotate the session ID on privilege change
- Constant-time comparison on token lookup
- Verify a new email address *before* switching it, never after
- Audit-log every authentication event, impersonation start/stop, and permission change

Better Auth handles most of these; the point of the list is that we verify rather than assume.

## Identity Model

**Day-one schema, even though SSO is deferred.** Retrofitting this means backfilling and
re-keying live sessions, which is the expensive version.

```
user                      ← a person. No tenant_id column.
├── identity              ← provider, provider_user_id, connection_id
│                           one user, N identities (password + SSO + …)
└── membership            ← user ↔ tenant, with plane, roles, customer_id?
```

Three rules that fall out of this:

1. **`password_hash` is nullable.** A federated user may never hold a credential.
2. **No `tenant_id` on `user`.** Membership is the join — a person can legitimately belong to two
   tenants, which happens when a fleet is serviced by two competing shops both running this
   software. (This was ADR-007, originally justified by Supabase's pool nesting. The Supabase
   rationale is gone; the decision stands on the real reason.)
3. **Identities are separate from users.** One person may authenticate by password today and via
   their hospital's IdP tomorrow, without becoming two accounts.

## The SSO Plan

Deferred, but planned — Fleetco's customers include large hospitals, which almost certainly run
enterprise identity providers.

### The Wrinkle: SSO Lands at Two Different Levels

Those hospitals are Fleetco's **customers**, which makes them **portal** users. So SSO is
configured per `customer_id`, not per `tenant_id` — and essentially every off-the-shelf B2B SSO
product assumes the latter.

| Shape | Who | Level | Tooling fit |
|---|---|---|---|
| Tenant SSO | A reseller fleet company's own staff | `tenant_id` | Standard, well-supported |
| **Customer SSO** | A hospital's fleet managers in the portal | `customer_id` within `tenant_id` | **Non-standard — we own the mapping** |

The connection registry must therefore key on `(tenant_id, customer_id | null)`. No library
models this for us, so plan to own that layer regardless of provider.

### Protocol Reality

Hospitals overwhelmingly run **Microsoft Entra ID**, which speaks OIDC happily — so OIDC-only
covers a surprising amount. But hospital IT is conservative, and any ADFS shop will insist on
**SAML 2.0**. Assume SAML is eventually required.

Better Auth has an SSO plugin covering OIDC, with SAML support added later; **verify SAML's
current maturity before committing to it**, since that is the piece enterprise IT is most likely
to demand.

### Build Now (Cheap, Painful to Retrofit)

1. The `identity` table above, with `connection_id`
2. An **empty `sso_connection` table** keyed on `(tenant_id, customer_id | null)`, with verified
   email domains per connection
3. **Home-realm discovery**: email domain → connection lookup on the login page. Model it now,
   implement it later
4. `Principal.authMethod`, so authorization never cares how someone authenticated
5. **A written JIT provisioning rule**: when an SSO user arrives with no account, create one —
   but bind `customer_id` to the **connection**, never infer scope from token claims. That
   inference is the cross-tenant leak waiting to happen.

### Build Later (When the First Hospital Asks)

| Provider | Choose when |
|---|---|
| **Better Auth SSO plugin** | OIDC suffices. No new vendor, stays behind the port. |
| **WorkOS** | SAML + SCIM needed, plus the IdP-onboarding admin UI. SAML metadata exchange with a hospital IT department is a real support burden worth outsourcing. |
| **Keycloak** | Per-connection cost dominates and we will carry the ops weight. |

### What Arrives Alongside SSO

- **SCIM provisioning** — auto-disable accounts when staff leave. It shows up in the same
  conversation as SSO almost every time, and it is separate work. WorkOS bundles it.
- **SOC 2** — correctly deferred for phase one, but hospital InfoSec reviews reach through to
  the platform. If the resale play is real, SOC 2 timing becomes a sales constraint rather than
  a nice-to-have.

**Commercial note: price SSO as an enterprise tier.** Every connection is hand-held onboarding
and it should pay for itself.

## Related

- [[Tenancy Model]] — authorization, the three planes, cross-tenant leak tests
- [[Architecture Decisions]] — ADR-012, ADR-013, ADR-016
- [[Stack Evaluation]]
- [[Operations]]
