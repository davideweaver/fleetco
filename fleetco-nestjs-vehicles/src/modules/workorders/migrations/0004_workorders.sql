-- Forward-only. The `workorders` module's own schema, per [[Evolution Path]]
-- rule 1.
--
-- Two cross-schema foreign keys, both composite on `(tenant_id, …)` for the
-- same reason the vehicles migration needed one: a plain FK would let a work
-- order in tenant A reference a fleet or a unit in tenant B, and only the
-- service layer would be standing in the way.
--
-- `vehicles` needs the same `(tenant_id, id)` unique index that `customers`
-- got in 0003. A third module adding an index to a second module's table is
-- now a pattern rather than a one-off, which is worth noticing: migration
-- ownership does not respect module lines, and probably never will.

CREATE SCHEMA IF NOT EXISTS workorders;

CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_id_key
    ON vehicles.vehicles (tenant_id, id);

CREATE TABLE workorders.work_orders (
    id                 uuid        PRIMARY KEY,
    tenant_id          uuid        NOT NULL,
    customer_id        uuid        NOT NULL,
    vehicle_id         uuid        NOT NULL,
    number             text        NOT NULL,
    status             text        NOT NULL,
    complaint          text        NOT NULL,
    odometer_in_miles  bigint      NOT NULL,
    total_cents        bigint      NOT NULL,
    authorized_at      timestamptz,
    closed_at          timestamptz,
    created_at         timestamptz NOT NULL,
    updated_at         timestamptz NOT NULL,

    CONSTRAINT work_orders_customer_fk
        FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers.customers (tenant_id, id),
    CONSTRAINT work_orders_vehicle_fk
        FOREIGN KEY (tenant_id, vehicle_id)
        REFERENCES vehicles.vehicles (tenant_id, id),

    CONSTRAINT work_orders_status_known
        CHECK (status IN ('draft', 'authorized', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT work_orders_number_not_blank
        CHECK (length(btrim(number)) > 0),
    CONSTRAINT work_orders_total_non_negative
        CHECK (total_cents >= 0),
    CONSTRAINT work_orders_odometer_non_negative
        CHECK (odometer_in_miles >= 0)
);

CREATE UNIQUE INDEX work_orders_tenant_number_key
    ON workorders.work_orders (tenant_id, number);
CREATE INDEX work_orders_tenant_customer_number_idx
    ON workorders.work_orders (tenant_id, customer_id, number, id);
CREATE INDEX work_orders_tenant_number_idx
    ON workorders.work_orders (tenant_id, number, id);
CREATE INDEX work_orders_vehicle_idx
    ON workorders.work_orders (tenant_id, vehicle_id);

-- The parent must be addressable by `(tenant_id, customer_id, id)` so a line
-- can be tied to it *and* to the fleet it was denormalised from, in one key.
CREATE UNIQUE INDEX work_orders_tenant_customer_id_key
    ON workorders.work_orders (tenant_id, customer_id, id);

CREATE TABLE workorders.work_order_lines (
    id               uuid        PRIMARY KEY,
    tenant_id        uuid        NOT NULL,
    customer_id      uuid        NOT NULL,
    work_order_id    uuid        NOT NULL,
    kind             text        NOT NULL,
    description      text        NOT NULL,
    quantity         integer     NOT NULL,
    unit_price_cents bigint      NOT NULL,
    amount_cents     bigint      NOT NULL,
    created_at       timestamptz NOT NULL,

    -- The composite reference is what keeps the denormalised `customer_id`
    -- honest: a line cannot claim a different fleet than its parent, and
    -- cannot cross a tenant boundary. Deleting the order takes its lines.
    CONSTRAINT work_order_lines_order_fk
        FOREIGN KEY (tenant_id, customer_id, work_order_id)
        REFERENCES workorders.work_orders (tenant_id, customer_id, id)
        ON DELETE CASCADE,

    CONSTRAINT work_order_lines_kind_known
        CHECK (kind IN ('labor', 'part')),
    CONSTRAINT work_order_lines_quantity_positive
        CHECK (quantity > 0),
    CONSTRAINT work_order_lines_unit_price_non_negative
        CHECK (unit_price_cents >= 0),
    CONSTRAINT work_order_lines_amount_non_negative
        CHECK (amount_cents >= 0)
);

CREATE INDEX work_order_lines_order_idx
    ON workorders.work_order_lines (tenant_id, work_order_id, id);
CREATE INDEX work_order_lines_tenant_customer_idx
    ON workorders.work_order_lines (tenant_id, customer_id, id);
