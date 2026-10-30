-- 0001 — the platform outbox.
--
-- Plain SQL, forward-only ([[Code Standards and Guardrails]] § The Golden
-- Module). No down migration: a rollback in production is a forward migration
-- written with the production data in front of you.
--
-- ADR-011 — no business logic in the database. There are no triggers and no
-- functions here. Constraints are not business logic and are used freely.

create schema if not exists platform;

create table platform.outbox (
  id              bigint generated always as identity primary key,
  tenant_id       uuid        not null,
  customer_id     uuid,
  name            text        not null,
  payload         jsonb       not null,
  occurred_at     timestamptz not null,
  dispatched_at   timestamptz,
  failed_attempts integer     not null default 0,
  last_error      text,

  constraint outbox_name_not_blank check (length(btrim(name)) > 0),
  constraint outbox_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint outbox_failed_attempts_non_negative check (failed_attempts >= 0)
);

-- The dispatcher's claim query. Partial, so it stays small however large the
-- table grows, which is what makes keeping history in this table affordable.
create index outbox_pending_idx on platform.outbox (id) where dispatched_at is null;

-- The SSE replay query: scope first, then cursor.
create index outbox_scope_cursor_idx on platform.outbox (tenant_id, customer_id, id);

-- Monthly partitioning is specified in [[Realtime and Events]] § Retention and
-- is deliberately not done here: the retention period is Q9-open, partitioning
-- an empty table is a one-migration change later, and a partitioned table
-- complicates nothing in this spike except the spike.
