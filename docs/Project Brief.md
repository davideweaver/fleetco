---
created: 2026-10-08
tags: [project, business, fleetco, brief]
source: Claude Code (Xerro)
---

## Overview

The framing document for the Fleetco engagement. What's being asked, by whom, and the criteria
Dave uses to decide whether to say yes.

## The Situation

Fleetco runs its business on FullBay, a SaaS platform for heavy-duty vehicle repair and fleet
maintenance shops. FullBay handles their internal operations *and* provides a customer-facing
portal so Fleetco's fleet customers can see their own vehicles, work, and invoices.

The complaint is not that FullBay is broken. It's that FullBay has stopped moving — no modern
updates, presumably a dated interface and a slow roadmap. Fleetco believes they can do better
and has already started prototyping.

This is a **replacement project**, which is a specific and unforgiving category of work: the
bar is not "is it good software," it's "can a shop run its entire day on this instead of the
thing that already works." There is no partial credit on day one.

## The Players

| Role | Who | Notes |
|---|---|---|
| Client | Fleetco (placeholder name) | Fleet management company, friend of Dave's |
| Owner | Dave's friend | Needs name, and clarity on who makes technical calls |
| Incumbent | FullBay | The system being replaced |
| Pilot customer | One of Fleetco's "smaller customers" | The first production tenant's customer |
| Dave | Technical lead / architect | Scope of involvement **undefined** — see below |

## Scope as Currently Understood

**Phase one target:** fully replace FullBay for one smaller Fleetco customer. That means
Fleetco's internal staff work that customer's vehicles entirely in the new system, and that
customer's own people log into the new portal instead of FullBay's.

Worth being blunt about: "one smaller customer" reduces *data volume*, not *feature surface*.
A shop still needs service orders, parts inventory, technician time tracking, customer
authorization, invoicing, PM scheduling, and a portal to run even one customer's work. See
[[Feature Inventory]].

**Phase two possibility:** resell the platform to other fleet management companies. This is
not a phase-two concern architecturally — it changes decisions that must be made on day one.
See [[Tenancy Model]].

## Dave's Decision Criteria

What needs to be true for this to be worth his time:

**Business**
- Is Dave an employee, a contractor, a co-founder, or doing a favor? This is unanswered and it
  determines everything else. If the resale play is real, equity is the only sane structure.
- Is Fleetco funded for this, or is it the owner's spare cash? Replacement projects run long.
- Who owns the IP, especially given the resale ambition?

**Technical**
- Is the existing prototype an asset or a liability? See [[Open Questions]].
- Can FullBay data actually be extracted? If it's screen-scraping, add months.
- Is the feature surface honestly scopeable to something a small team ships in a year?

**Personal**
- Does Dave want to be the long-term owner of a production B2B system a real business depends
  on, alongside a full-time job at ServiceTitan? Replacement software generates support load
  immediately and forever.
- Working with a friend on software their livelihood depends on. Worth naming the risk out loud
  before any code is written.

## Why This Project Is Genuinely Interesting

The honest case *for* it, so the brief isn't one-sided:

- Vertical B2B SaaS with a real incumbent that customers are frustrated by is a good business
  shape. The market exists and is already paying. **Fleetco reports paying $5k/month for FullBay** (composition unverified — see Q18) —
  that's the real market signal. It's also a forcing function: the ROI on replacement is obvious.
- Fleetco is both the first customer and the domain expert. That's the ideal design partner —
  no guessing at requirements.
- The resale path means the work compounds instead of being a one-off internal tool.
- Dave's background maps directly: he's built and sold vertical software before
  (Mission Research / GiftWorks), which is nearly the same motion.

## Risks

| Risk | Severity | Note |
|---|---|---|
| Feature surface is far larger than "one small customer" implies | High | The classic replacement-project failure |
| FullBay data cannot be cleanly exported | High | Could add months; verify early |
| Scope creep from a design partner who is also the owner | High | Needs a written scope, friend or not |
| Dave becomes the single point of failure on production software | High | Support load is permanent |
| Prototype has to be thrown away | Medium | Sunk cost arguments will follow |
| Resale ambition drives premature platform-building | Medium | Mitigated by [[Tenancy Model]] discipline |
| Friendship strain if the project struggles | Medium | Name it up front |

## Related

- [[Fleetco Overview]]
- [[Open Questions]]
- [[Stack Evaluation]]
