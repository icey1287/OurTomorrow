-- Stage 6 keeps historical footprint and future intent as separate dimensions.
CREATE TYPE "PlaceHistoryState" AS ENUM ('UNVISITED', 'VISITED', 'LIVED');
CREATE TYPE "PlaceFutureState" AS ENUM ('NONE', 'WANT_TO_GO', 'PLANNED', 'DEPARTING', 'COMPLETED');

ALTER TABLE "places"
ADD COLUMN "history_state" "PlaceHistoryState" NOT NULL DEFAULT 'VISITED',
ADD COLUMN "future_state" "PlaceFutureState" NOT NULL DEFAULT 'NONE';

UPDATE "places"
SET
  "history_state" = CASE
    WHEN "status" = 'LIVED' THEN 'LIVED'::"PlaceHistoryState"
    WHEN "status" IN ('VISITED', 'FIRST_TIME', 'COMPLETED') THEN 'VISITED'::"PlaceHistoryState"
    ELSE 'UNVISITED'::"PlaceHistoryState"
  END,
  "future_state" = CASE
    WHEN "status" = 'WANT_TO_GO' THEN 'WANT_TO_GO'::"PlaceFutureState"
    WHEN "status" = 'PLANNED' THEN 'PLANNED'::"PlaceFutureState"
    WHEN "status" = 'DEPARTING' THEN 'DEPARTING'::"PlaceFutureState"
    WHEN "status" = 'COMPLETED' THEN 'COMPLETED'::"PlaceFutureState"
    ELSE 'NONE'::"PlaceFutureState"
  END;

CREATE INDEX "places_couple_id_history_state_deleted_at_idx"
ON "places"("couple_id", "history_state", "deleted_at");
CREATE INDEX "places_couple_id_future_state_deleted_at_idx"
ON "places"("couple_id", "future_state", "deleted_at");

-- One couple-local blind-box slot is shared by both fixed identities each day.
ALTER TABLE "memory_resurfaces"
ADD COLUMN "local_date" DATE,
ADD COLUMN "opened_at" TIMESTAMPTZ(3);

UPDATE "memory_resurfaces" AS resurface
SET "local_date" = (resurface."displayed_at" AT TIME ZONE couple."timezone")::date
FROM "couples" AS couple
WHERE couple."id" = resurface."couple_id";

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "couple_id", "local_date"
      ORDER BY "displayed_at" DESC, "id" DESC
    ) AS rank
  FROM "memory_resurfaces"
)
DELETE FROM "memory_resurfaces" AS resurface
USING ranked
WHERE resurface."id" = ranked."id" AND ranked.rank > 1;

ALTER TABLE "memory_resurfaces"
ALTER COLUMN "local_date" SET NOT NULL;

CREATE UNIQUE INDEX "memory_resurfaces_couple_id_local_date_key"
ON "memory_resurfaces"("couple_id", "local_date");

CREATE INDEX "touch_events_couple_id_sender_id_created_at_idx"
ON "touch_events"("couple_id", "sender_id", "created_at" DESC);

ALTER TYPE "ScheduledEventType" ADD VALUE 'CALM_LETTER_UNLOCK';
