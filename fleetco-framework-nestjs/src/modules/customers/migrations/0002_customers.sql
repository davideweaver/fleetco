-- Forward-only. The `customers` module's own schema, per [[Evolution Path]]
-- rule 1: one Postgres instance, logically partitioned by schema.

CREATE SCHEMA IF NOT EXISTS customers;

CREATE TABLE customers.customers (
    id                        uuid        PRIMARY KEY,
    tenant_id                 uuid        NOT NULL,
    code                      text        NOT NULL,
    name                      text        NOT NULL,
    status                    text        NOT NULL,
    credit_limit_cents        bigint      NOT NULL,
    default_labor_rate_cents  bigint      NOT NULL,
    billing_terms_net_days    integer     NOT NULL,
    is_on_credit_hold         boolean     NOT NULL DEFAULT false,
    primary_contact_email     text,
    primary_contact_phone     text,
    created_at                timestamptz NOT NULL,
    updated_at                timestamptz NOT NULL,

    CONSTRAINT customers_status_known
        CHECK (status IN ('prospect', 'active', 'inactive')),
    CONSTRAINT customers_code_upper
        CHECK (code = upper(code)),
    CONSTRAINT customers_code_not_blank
        CHECK (length(btrim(code)) > 0),
    CONSTRAINT customers_name_not_blank
        CHECK (length(btrim(name)) > 0),
    CONSTRAINT customers_credit_limit_non_negative
        CHECK (credit_limit_cents >= 0),
    CONSTRAINT customers_labor_rate_positive
        CHECK (default_labor_rate_cents > 0),
    CONSTRAINT customers_billing_terms_known
        CHECK (billing_terms_net_days IN (0, 15, 30, 45, 60))
);

-- Tenant-scoped, not global. A global unique index on `code` would let one
-- tenant's codes collide with another's.
CREATE UNIQUE INDEX customers_tenant_code_key
    ON customers.customers (tenant_id, code);

-- Serves the default list query: scope by tenant, filter by status, sort by name.
CREATE INDEX customers_tenant_status_name_idx
    ON customers.customers (tenant_id, status, name, id);
