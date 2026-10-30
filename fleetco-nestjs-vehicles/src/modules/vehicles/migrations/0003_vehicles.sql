-- Forward-only. The `vehicles` module's own schema, per [[Evolution Path]]
-- rule 1: one Postgres instance, logically partitioned by schema.

CREATE SCHEMA IF NOT EXISTS vehicles;

-- ---------------------------------------------------------------------------
-- A cross-module migration, and the first one in the codebase.
--
-- [[Evolution Path]] rule 2 keeps foreign keys across schema lines and bans
-- only the queries: "Keep foreign keys across schemas at the database level.
-- Restrict query access in application code."
--
-- A plain FK on `customer_id` alone would let a vehicle in tenant A reference
-- a customer in tenant B — the database would accept it, and only the service
-- layer would be standing in the way. The composite FK below makes that
-- unrepresentable, and it needs a unique index on the *customers* table to
-- point at. So this migration, owned by the vehicles module, adds an index to
-- another module's table.
--
-- That is the right trade (a tenancy guarantee in the database beats one in a
-- service), but it means migration ownership does not respect module lines the
-- way everything else does. Recorded as a finding rather than smoothed over.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_id_key
    ON customers.customers (tenant_id, id);

CREATE TABLE vehicles.vehicles (
    id              uuid        PRIMARY KEY,
    tenant_id       uuid        NOT NULL,
    customer_id     uuid        NOT NULL,
    unit_number     text        NOT NULL,
    vin             text        NOT NULL,
    make            text        NOT NULL,
    model           text        NOT NULL,
    model_year      integer     NOT NULL,
    vehicle_class   text        NOT NULL,
    status          text        NOT NULL,
    odometer_miles  bigint      NOT NULL,
    last_serviced_at timestamptz,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,

    -- The tenant is part of the reference, so a cross-tenant parent is refused
    -- by the database rather than by the service.
    CONSTRAINT vehicles_customer_fk
        FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers.customers (tenant_id, id),

    CONSTRAINT vehicles_status_known
        CHECK (status IN ('out_of_service', 'active', 'retired')),
    CONSTRAINT vehicles_class_known
        CHECK (vehicle_class IN ('light_duty', 'medium_duty', 'heavy_duty', 'trailer')),
    CONSTRAINT vehicles_vin_shape
        CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
    CONSTRAINT vehicles_unit_not_blank
        CHECK (length(btrim(unit_number)) > 0),
    CONSTRAINT vehicles_model_year_sane
        CHECK (model_year BETWEEN 1900 AND 2100),
    CONSTRAINT vehicles_odometer_non_negative
        CHECK (odometer_miles >= 0)
);

-- Unit numbers are unique within a fleet, not within a tenant. Two customers
-- both numbering a truck `101` is normal.
CREATE UNIQUE INDEX vehicles_customer_unit_key
    ON vehicles.vehicles (tenant_id, customer_id, unit_number);

-- VIN is unique per tenant. Globally unique in reality, but a cross-tenant
-- unique index would let one shop's data cause an insert failure in another's,
-- which leaks information through an error message.
CREATE UNIQUE INDEX vehicles_tenant_vin_key
    ON vehicles.vehicles (tenant_id, vin);

-- Serves the portal list query: scope by tenant and customer, sort by unit.
CREATE INDEX vehicles_tenant_customer_unit_idx
    ON vehicles.vehicles (tenant_id, customer_id, unit_number, id);

-- Serves the staff list query, which is not pinned to one customer.
CREATE INDEX vehicles_tenant_unit_idx
    ON vehicles.vehicles (tenant_id, unit_number, id);
