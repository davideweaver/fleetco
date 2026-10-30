-- 0002 — the customers module's own schema and table.
--
-- Evolution Path rule 1: one Postgres schema per module, never `public.*` for
-- everything. The boundary is greppable, and "move these tables to their own
-- database" stays mechanical.

create schema if not exists customers;

create table customers.customers (
  id                       uuid        primary key,
  tenant_id                uuid        not null,

  code                     text        not null,
  name                     text        not null,
  status                   text        not null,

  credit_limit_cents       bigint      not null,
  default_labor_rate_cents bigint      not null,
  billing_terms_net_days   integer     not null,

  is_on_credit_hold        boolean     not null default false,

  primary_contact_email    text,
  primary_contact_phone    text,

  created_at               timestamptz not null,
  updated_at               timestamptz not null,

  -- Restating the service's rules where a bad migration or a hand-run UPDATE
  -- cannot get around them. Constraints are emphatically not business logic
  -- (ADR-011) and the standards doc says to use them aggressively.
  constraint customers_status_known check (status in ('prospect', 'active', 'inactive')),
  constraint customers_code_upper check (code = upper(code)),
  constraint customers_code_not_blank check (length(btrim(code)) > 0),
  constraint customers_name_not_blank check (length(btrim(name)) > 0),
  constraint customers_credit_limit_non_negative check (credit_limit_cents >= 0),
  constraint customers_labor_rate_positive check (default_labor_rate_cents > 0),
  constraint customers_billing_terms_known check (billing_terms_net_days in (0, 15, 30, 45, 60))
);

-- Tenant-scoped uniqueness. A global unique index on `code` would make one
-- tenant's codes collide with another's — a cross-tenant defect dressed up as a
-- constraint.
create unique index customers_tenant_code_key on customers.customers (tenant_id, code);

-- Covers the list endpoint's keyset page: scope, then filter, then sort.
create index customers_tenant_status_name_idx
  on customers.customers (tenant_id, status, name, id);
