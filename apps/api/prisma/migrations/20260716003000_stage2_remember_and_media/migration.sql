ALTER TABLE "media_assets"
ADD COLUMN "upload_expires_at" TIMESTAMPTZ(3),
ADD COLUMN "uploaded_at" TIMESTAMPTZ(3),
ADD COLUMN "ready_at" TIMESTAMPTZ(3),
ADD COLUMN "updated_at" TIMESTAMPTZ(3);

UPDATE "media_assets"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "media_assets"
ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "tags"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updated_at" TIMESTAMPTZ(3),
ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

UPDATE "tags"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "tags"
ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX "media_assets_created_by_status_deleted_at_created_at_idx"
ON "media_assets"("created_by", "status", "deleted_at", "created_at" DESC);

CREATE INDEX "media_assets_status_upload_expires_at_idx"
ON "media_assets"("status", "upload_expires_at");

CREATE INDEX "memories_couple_id_status_deleted_at_is_pinned_happened_idx"
ON "memories"("couple_id", "status", "deleted_at", "is_pinned" DESC, "happened_at" DESC, "id");

CREATE INDEX "tags_couple_id_deleted_at_name_idx"
ON "tags"("couple_id", "deleted_at", "name");

DROP INDEX "comments_memory_id_created_at_idx";
CREATE INDEX "comments_memory_id_deleted_at_created_at_idx"
ON "comments"("memory_id", "deleted_at", "created_at");

CREATE INDEX "memory_resurfaces_couple_id_reason_displayed_at_idx"
ON "memory_resurfaces"("couple_id", "reason", "displayed_at" DESC);
