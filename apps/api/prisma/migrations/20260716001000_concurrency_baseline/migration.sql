-- Optimistic concurrency for editable aggregate roots.
ALTER TABLE "users" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "couples" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "places" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "memories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "memory_perspectives" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "annual_reviews" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "current_statuses" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "notes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "daily_entries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "mood_entries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "daily_rituals" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "calm_letters" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "wishes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "plans" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "anniversaries" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "capsules" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "capsule_messages" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Persist command results so retries cannot duplicate conversions, uploads, or exports.
CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "couple_id" UUID,
  "route" VARCHAR(180) NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response_status" INTEGER NOT NULL,
  "response_body" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_user_id_route_key_hash_key"
ON "idempotency_records"("user_id", "route", "key_hash");

CREATE INDEX "idempotency_records_expires_at_idx"
ON "idempotency_records"("expires_at");

CREATE INDEX "idempotency_records_couple_id_created_at_idx"
ON "idempotency_records"("couple_id", "created_at" DESC);

ALTER TABLE "idempotency_records"
ADD CONSTRAINT "idempotency_records_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idempotency_records"
ADD CONSTRAINT "idempotency_records_couple_id_fkey"
FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
