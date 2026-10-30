-- Forward-only. Never edit an applied migration.

create schema if not exists customers;

create table customers.customers (
  id                        uuid        primary key,
  tenant_id                 uuid        not null,

  code                      text        not null,
  name                      text        not null,
  status                    text        not null,

  credit_limit_cents        bigint      not null,
  default_labor_rate_cents  bigint      not null,
  billing_terms_net_days    integer     not null,

  is_on_credit_hold         boolean     not null default false,

  primary_contact_email     text,
  primary_contact_phone     text,

  created_at                timestamptz not null,
  updated_at                timestamptz not null,

  constraint customers_status_known              check (status in ('prospect', 'active', 'inactive')),
  constraint customers_code_upper                check (code = upper(code)),
  constraint customers_code_not_blank            check (length(btrim(code)) > 0),
  constraint customers_name_not_blank            check (length(btrim(name)) > 0),
  constraint customers_credit_limit_non_negative check (credit_limit_cents >= 0),
  constraint customers_labor_rate_positive       check (default_labor_rate_cents > 0),
  constraint customers_billing_terms_known       check (billing_terms_net_days in (0, 15, 30, 45, 60))
);

-- Tenant-scoped, not global: one shop's `ACME` must not collide with another's.
create unique index customers_tenant_code_key
  on customers.customers (tenant_id, code);

-- Covers the list endpoint's filter and its keyset order. `tenant_id` leads,
-- per the migration playbook's indexing rule.
create index customers_tenant_status_name_idx
  on customers.customers (tenant_id, status, name, id);
