-- CreateEnum
CREATE TYPE "RecycleBinResourceType" AS ENUM ('MEMORY', 'NOTE', 'WISH', 'PLAN', 'ANNIVERSARY', 'CAPSULE', 'PLACE', 'TAG', 'MEDIA');

-- CreateEnum
CREATE TYPE "RecycleBinItemStatus" AS ENUM ('AVAILABLE', 'RESTORED', 'PURGE_PENDING', 'PURGING', 'PURGED');

-- CreateEnum
CREATE TYPE "RecycleBinVisibility" AS ENUM ('SHARED', 'OWNER_ONLY');

-- CreateTable
CREATE TABLE "recycle_bin_items" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "resource_type" "RecycleBinResourceType" NOT NULL,
    "resource_id" UUID NOT NULL,
    "status" "RecycleBinItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "visibility" "RecycleBinVisibility" NOT NULL DEFAULT 'SHARED',
    "owner_id" UUID,
    "deleted_by" UUID NOT NULL,
    "restore_data" JSONB NOT NULL,
    "deleted_at" TIMESTAMPTZ(3) NOT NULL,
    "retention_until" TIMESTAMPTZ(3) NOT NULL,
    "restored_at" TIMESTAMPTZ(3),
    "restored_by" UUID,
    "purge_requested_at" TIMESTAMPTZ(3),
    "purge_requested_by" UUID,
    "purge_after" TIMESTAMPTZ(3),
    "purged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recycle_bin_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recycle_bin_items_owner_visibility_check"
      CHECK ("visibility" = 'SHARED' OR "owner_id" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "recycle_bin_items_couple_id_status_deleted_at_id_idx" ON "recycle_bin_items"("couple_id", "status", "deleted_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "recycle_bin_items_couple_id_resource_type_status_deleted_at_idx" ON "recycle_bin_items"("couple_id", "resource_type", "status", "deleted_at" DESC);

-- CreateIndex
CREATE INDEX "recycle_bin_items_couple_id_owner_id_status_deleted_at_idx" ON "recycle_bin_items"("couple_id", "owner_id", "status", "deleted_at" DESC);

-- CreateIndex
CREATE INDEX "recycle_bin_items_resource_type_resource_id_status_idx" ON "recycle_bin_items"("resource_type", "resource_id", "status");

-- CreateIndex
CREATE INDEX "recycle_bin_items_status_retention_until_idx" ON "recycle_bin_items"("status", "retention_until");

-- AddForeignKey
ALTER TABLE "recycle_bin_items" ADD CONSTRAINT "recycle_bin_items_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_bin_items" ADD CONSTRAINT "recycle_bin_items_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
