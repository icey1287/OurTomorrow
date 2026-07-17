-- Stage 4 domain additions are kept separate from the existing enum-value
-- migration because PostgreSQL cannot safely use a newly-added enum value in
-- every statement of the same migration transaction.
CREATE TYPE "AnniversaryLeapDayRule" AS ENUM ('FEBRUARY_28', 'MARCH_1');
CREATE TYPE "ConversionSourceType" AS ENUM ('NOTE', 'WISH', 'CAPSULE', 'ANNIVERSARY');
CREATE TYPE "ConversionTargetType" AS ENUM ('MEMORY', 'WISH', 'ANNIVERSARY');

ALTER TABLE "anniversaries"
ADD COLUMN "leap_day_rule" "AnniversaryLeapDayRule" NOT NULL DEFAULT 'FEBRUARY_28';

ALTER TABLE "capsules"
ADD COLUMN "sealed_digest" VARCHAR(64);

ALTER TABLE "plans"
ADD COLUMN "anniversary_occurrence_date" DATE,
ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN "completed_at" TIMESTAMPTZ(3);

ALTER TABLE "wishes"
ADD COLUMN "completed_by" UUID,
ADD COLUMN "completion_note" TEXT;

CREATE TABLE "wish_media" (
  "wish_id" UUID NOT NULL,
  "media_asset_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wish_media_pkey" PRIMARY KEY ("wish_id", "media_asset_id")
);

CREATE TABLE "anniversary_reminders" (
  "id" UUID NOT NULL,
  "couple_id" UUID NOT NULL,
  "anniversary_id" UUID NOT NULL,
  "days_before" INTEGER NOT NULL DEFAULT 0,
  "minute_of_day" INTEGER NOT NULL DEFAULT 540,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "anniversary_reminders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "content_conversions" (
  "id" UUID NOT NULL,
  "couple_id" UUID NOT NULL,
  "source_type" "ConversionSourceType" NOT NULL,
  "source_id" UUID NOT NULL,
  "source_occurrence" VARCHAR(32) NOT NULL DEFAULT 'once',
  "target_type" "ConversionTargetType" NOT NULL,
  "target_id" UUID NOT NULL,
  "converted_by" UUID NOT NULL,
  "converted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_conversions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wish_media_wish_id_sort_order_idx"
ON "wish_media"("wish_id", "sort_order");

CREATE INDEX "wish_media_media_asset_id_idx"
ON "wish_media"("media_asset_id");

CREATE INDEX "anniversary_reminders_couple_id_enabled_idx"
ON "anniversary_reminders"("couple_id", "enabled");

CREATE UNIQUE INDEX "anniversary_reminders_anniversary_id_days_before_minute_of__key"
ON "anniversary_reminders"("anniversary_id", "days_before", "minute_of_day");

CREATE INDEX "content_conversions_couple_id_converted_at_idx"
ON "content_conversions"("couple_id", "converted_at" DESC);

CREATE UNIQUE INDEX "content_conversions_couple_id_source_type_source_id_source__key"
ON "content_conversions"("couple_id", "source_type", "source_id", "source_occurrence");

CREATE UNIQUE INDEX "content_conversions_couple_id_target_type_target_id_key"
ON "content_conversions"("couple_id", "target_type", "target_id");

CREATE INDEX "capsules_couple_id_status_due_at_idx"
ON "capsules"("couple_id", "status", "due_at");

CREATE INDEX "plans_anniversary_id_anniversary_occurrence_date_idx"
ON "plans"("anniversary_id", "anniversary_occurrence_date");

CREATE INDEX "wishes_completed_by_completed_at_idx"
ON "wishes"("completed_by", "completed_at");

ALTER TABLE "wishes"
ADD CONSTRAINT "wishes_completed_by_fkey"
FOREIGN KEY ("completed_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wish_media"
ADD CONSTRAINT "wish_media_wish_id_fkey"
FOREIGN KEY ("wish_id") REFERENCES "wishes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wish_media"
ADD CONSTRAINT "wish_media_media_asset_id_fkey"
FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "anniversary_reminders"
ADD CONSTRAINT "anniversary_reminders_couple_id_fkey"
FOREIGN KEY ("couple_id") REFERENCES "couples"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "anniversary_reminders"
ADD CONSTRAINT "anniversary_reminders_anniversary_id_fkey"
FOREIGN KEY ("anniversary_id") REFERENCES "anniversaries"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_conversions"
ADD CONSTRAINT "content_conversions_couple_id_fkey"
FOREIGN KEY ("couple_id") REFERENCES "couples"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_conversions"
ADD CONSTRAINT "content_conversions_converted_by_fkey"
FOREIGN KEY ("converted_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wish_media"
ADD CONSTRAINT "wish_media_sort_order_check"
CHECK ("sort_order" >= 0);

ALTER TABLE "plans"
ADD CONSTRAINT "plans_time_order_check"
CHECK ("ends_at" IS NULL OR "starts_at" IS NULL OR "ends_at" >= "starts_at"),
ADD CONSTRAINT "plans_reminder_before_start_check"
CHECK ("reminder_at" IS NULL OR ("starts_at" IS NOT NULL AND "reminder_at" <= "starts_at")),
ADD CONSTRAINT "plans_terminal_time_check"
CHECK (NOT ("completed_at" IS NOT NULL AND "cancelled_at" IS NOT NULL));

ALTER TABLE "anniversary_reminders"
ADD CONSTRAINT "anniversary_reminders_days_before_check"
CHECK ("days_before" BETWEEN 0 AND 3650),
ADD CONSTRAINT "anniversary_reminders_minute_of_day_check"
CHECK ("minute_of_day" BETWEEN 0 AND 1439);

ALTER TABLE "capsules"
ADD CONSTRAINT "capsules_sealed_digest_check"
CHECK ("sealed_digest" IS NULL OR "sealed_digest" ~ '^[0-9a-f]{64}$');

ALTER TABLE "content_conversions"
ADD CONSTRAINT "content_conversions_source_occurrence_check"
CHECK (length(trim("source_occurrence")) > 0),
ADD CONSTRAINT "content_conversions_route_check"
CHECK (
  ("source_type" = 'NOTE' AND "target_type" IN ('MEMORY', 'WISH', 'ANNIVERSARY'))
  OR ("source_type" IN ('WISH', 'CAPSULE', 'ANNIVERSARY') AND "target_type" = 'MEMORY')
);

-- Preserve the single reminder field from the initial schema as a first
-- normalized reminder rule. Future writes use anniversary_reminders.
INSERT INTO "anniversary_reminders" (
  "id",
  "couple_id",
  "anniversary_id",
  "days_before",
  "minute_of_day",
  "enabled",
  "created_at",
  "updated_at"
)
SELECT
  md5("id"::text || ':stage4-reminder')::uuid,
  "couple_id",
  "id",
  "reminder_days_before",
  540,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "anniversaries"
WHERE "deleted_at" IS NULL
ON CONFLICT DO NOTHING;
