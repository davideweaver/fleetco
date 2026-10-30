-- Forward-only. The transactional outbox from [[Realtime and Events]].
--
-- Deliberately NOT partitioned by month yet. [[Realtime and Events]]
-- § Retention calls for monthly partitions, but a partitioned table cannot
-- carry a single-column identity primary key (the partition key must be in the
-- PK), which turns the replay cursor into a composite and changes the SSE
-- contract. That is a retention concern, not a correctness one, and it is
-- tracked rather than guessed at here.

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.outbox_events (
    id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id        uuid        NOT NULL,
    customer_id      uuid,
    topic            text        NOT NULL,
    name             text        NOT NULL,
    payload          jsonb       NOT NULL,
    occurred_at      timestamptz NOT NULL,
    dispatched_at    timestamptz,
    failed_attempts  integer     NOT NULL DEFAULT 0,
    last_error       text,

    CONSTRAINT outbox_events_topic_not_blank CHECK (length(btrim(topic)) > 0),
    CONSTRAINT outbox_events_name_not_blank  CHECK (length(btrim(name)) > 0)
);

-- The dispatcher's SELECT ... FOR UPDATE SKIP LOCKED path.
CREATE INDEX outbox_events_pending_idx
    ON platform.outbox_events (id)
    WHERE dispatched_at IS NULL;

-- The SSE replay path: scope by tenant and topic, then walk the cursor.
CREATE INDEX outbox_events_replay_idx
    ON platform.outbox_events (tenant_id, topic, id);
