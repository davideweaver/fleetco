-- Forward-only. Never edit an applied migration.
--
-- The outbox from [[Realtime and Events]]. Partitioning by month (§ Retention)
-- is deliberately not here: it is an operations change that needs the
-- retention period from Q9 and it is additive, so it does not belong in the
-- migration that creates the table.

create schema if not exists platform;

create table platform.outbox_events (
  id              bigint generated always as identity primary key,
  tenant_id       uuid        not null,
  customer_id     uuid,
  topic           text        not null,
  name            text        not null,
  payload         jsonb       not null,
  occurred_at     timestamptz not null,
  dispatched_at   timestamptz,
  failed_attempts integer     not null default 0,
  last_error      text,

  constraint outbox_events_topic_not_blank check (length(btrim(topic)) > 0),
  constraint outbox_events_name_not_blank  check (length(btrim(name)) > 0)
);

-- The dispatcher's claim query: pending rows in id order.
create index outbox_events_pending_idx
  on platform.outbox_events (id)
  where dispatched_at is null;

-- The SSE replay query: one topic within one tenant, from a cursor.
-- `tenant_id` leads, per the migration playbook's indexing rule.
create index outbox_events_replay_idx
  on platform.outbox_events (tenant_id, topic, id);
