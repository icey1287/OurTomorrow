-- Strengthen the persistent queues used by scheduled daily features.
ALTER TABLE "scheduled_events"
ADD COLUMN "dedupe_key" VARCHAR(180),
ADD COLUMN "locked_until" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "scheduled_events_dedupe_key_key"
ON "scheduled_events"("dedupe_key");

ALTER TABLE "outbox_events"
ADD COLUMN "dedupe_key" VARCHAR(180),
ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "locked_at" TIMESTAMPTZ(3),
ADD COLUMN "locked_until" TIMESTAMPTZ(3),
ADD COLUMN "locked_by" VARCHAR(120);

CREATE UNIQUE INDEX "outbox_events_dedupe_key_key"
ON "outbox_events"("dedupe_key");

CREATE INDEX "outbox_events_couple_id_published_at_id_idx"
ON "outbox_events"("couple_id", "published_at", "id");

CREATE INDEX "outbox_events_due_queue_idx"
ON "outbox_events"("available_at", "id")
WHERE "status" IN ('PENDING', 'RETRYING');

ALTER TABLE "outbox_events"
ADD CONSTRAINT "outbox_events_attempts_check"
CHECK (
  "attempts" >= 0
  AND "max_attempts" > 0
  AND "attempts" <= "max_attempts"
);

-- Track the instant a scheduled note really became visible.
ALTER TABLE "notes"
ADD COLUMN "visible_at" TIMESTAMPTZ(3);

ALTER TABLE "notes"
ADD CONSTRAINT "notes_expiration_after_show_check"
CHECK (
  "expires_at" IS NULL
  OR "expires_at" > COALESCE("show_at", "created_at")
);

ALTER TABLE "current_statuses"
ADD CONSTRAINT "current_statuses_expires_after_starts_check"
CHECK ("expires_at" > "starts_at");

ALTER TABLE "daily_entries"
ADD CONSTRAINT "daily_entries_postscript_after_reveal_check"
CHECK ("postscript" IS NULL OR "status" = 'REVEALED');
