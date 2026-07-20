-- DropForeignKey
ALTER TABLE "anniversaries" DROP CONSTRAINT "anniversaries_background_media_id_fkey";

-- DropForeignKey
ALTER TABLE "anniversaries" DROP CONSTRAINT "anniversaries_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "anniversaries" DROP CONSTRAINT "anniversaries_created_by_fkey";

-- DropForeignKey
ALTER TABLE "anniversaries" DROP CONSTRAINT "anniversaries_source_note_id_fkey";

-- DropForeignKey
ALTER TABLE "anniversary_reminders" DROP CONSTRAINT "anniversary_reminders_anniversary_id_fkey";

-- DropForeignKey
ALTER TABLE "anniversary_reminders" DROP CONSTRAINT "anniversary_reminders_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "annual_review_contributions" DROP CONSTRAINT "annual_review_contributions_annual_review_id_fkey";

-- DropForeignKey
ALTER TABLE "annual_review_contributions" DROP CONSTRAINT "annual_review_contributions_author_id_fkey";

-- DropForeignKey
ALTER TABLE "annual_review_contributions" DROP CONSTRAINT "annual_review_contributions_selected_media_id_fkey";

-- DropForeignKey
ALTER TABLE "annual_reviews" DROP CONSTRAINT "annual_reviews_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "calm_letters" DROP CONSTRAINT "calm_letters_author_id_fkey";

-- DropForeignKey
ALTER TABLE "calm_letters" DROP CONSTRAINT "calm_letters_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "calm_letters" DROP CONSTRAINT "calm_letters_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_media" DROP CONSTRAINT "capsule_media_capsule_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_media" DROP CONSTRAINT "capsule_media_media_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_messages" DROP CONSTRAINT "capsule_messages_author_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_messages" DROP CONSTRAINT "capsule_messages_capsule_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_open_records" DROP CONSTRAINT "capsule_open_records_capsule_id_fkey";

-- DropForeignKey
ALTER TABLE "capsule_open_records" DROP CONSTRAINT "capsule_open_records_user_id_fkey";

-- DropForeignKey
ALTER TABLE "capsules" DROP CONSTRAINT "capsules_anniversary_id_fkey";

-- DropForeignKey
ALTER TABLE "capsules" DROP CONSTRAINT "capsules_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "capsules" DROP CONSTRAINT "capsules_created_by_fkey";

-- DropForeignKey
ALTER TABLE "capsules" DROP CONSTRAINT "capsules_wish_id_fkey";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_author_id_fkey";

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_memory_id_fkey";

-- DropForeignKey
ALTER TABLE "content_conversions" DROP CONSTRAINT "content_conversions_converted_by_fkey";

-- DropForeignKey
ALTER TABLE "content_conversions" DROP CONSTRAINT "content_conversions_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "content_revisions" DROP CONSTRAINT "content_revisions_author_id_fkey";

-- DropForeignKey
ALTER TABLE "content_revisions" DROP CONSTRAINT "content_revisions_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "couple_members" DROP CONSTRAINT "couple_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "couples" DROP CONSTRAINT "couples_cover_media_id_fkey";

-- DropForeignKey
ALTER TABLE "daily_entries" DROP CONSTRAINT "daily_entries_author_id_fkey";

-- DropForeignKey
ALTER TABLE "daily_entries" DROP CONSTRAINT "daily_entries_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "daily_entries" DROP CONSTRAINT "daily_entries_prompt_id_fkey";

-- DropForeignKey
ALTER TABLE "daily_prompts" DROP CONSTRAINT "daily_prompts_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "daily_prompts" DROP CONSTRAINT "daily_prompts_created_by_fkey";

-- DropForeignKey
ALTER TABLE "daily_rituals" DROP CONSTRAINT "daily_rituals_chosen_by_fkey";

-- DropForeignKey
ALTER TABLE "daily_rituals" DROP CONSTRAINT "daily_rituals_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "export_jobs" DROP CONSTRAINT "export_jobs_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "export_jobs" DROP CONSTRAINT "export_jobs_requested_by_fkey";

-- DropForeignKey
ALTER TABLE "idempotency_records" DROP CONSTRAINT "idempotency_records_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "idempotency_records" DROP CONSTRAINT "idempotency_records_user_id_fkey";

-- DropForeignKey
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_created_by_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_cover_media_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_created_by_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_place_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_source_anniversary_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_source_capsule_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_source_note_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_source_wish_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "memory_media" DROP CONSTRAINT "memory_media_media_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_media" DROP CONSTRAINT "memory_media_memory_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_perspectives" DROP CONSTRAINT "memory_perspectives_author_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_perspectives" DROP CONSTRAINT "memory_perspectives_memory_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_resurfaces" DROP CONSTRAINT "memory_resurfaces_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_resurfaces" DROP CONSTRAINT "memory_resurfaces_memory_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_tags" DROP CONSTRAINT "memory_tags_memory_id_fkey";

-- DropForeignKey
ALTER TABLE "memory_tags" DROP CONSTRAINT "memory_tags_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "mood_entries" DROP CONSTRAINT "mood_entries_author_id_fkey";

-- DropForeignKey
ALTER TABLE "mood_entries" DROP CONSTRAINT "mood_entries_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_author_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_source_status_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "places" DROP CONSTRAINT "places_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "places" DROP CONSTRAINT "places_created_by_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_anniversary_id_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_created_by_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_place_id_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_wish_id_fkey";

-- DropForeignKey
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_author_id_fkey";

-- DropForeignKey
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "recycle_bin_items" DROP CONSTRAINT "recycle_bin_items_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "recycle_bin_items" DROP CONSTRAINT "recycle_bin_items_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_events" DROP CONSTRAINT "scheduled_events_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "tags_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "touch_events" DROP CONSTRAINT "touch_events_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "touch_events" DROP CONSTRAINT "touch_events_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "touch_events" DROP CONSTRAINT "touch_events_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_avatar_media_id_fkey";

-- DropForeignKey
ALTER TABLE "wish_media" DROP CONSTRAINT "wish_media_media_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "wish_media" DROP CONSTRAINT "wish_media_wish_id_fkey";

-- DropForeignKey
ALTER TABLE "wish_updates" DROP CONSTRAINT "wish_updates_author_id_fkey";

-- DropForeignKey
ALTER TABLE "wish_updates" DROP CONSTRAINT "wish_updates_wish_id_fkey";

-- DropForeignKey
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_completed_by_fkey";

-- DropForeignKey
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_couple_id_fkey";

-- DropForeignKey
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_created_by_fkey";

-- DropForeignKey
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_place_id_fkey";

-- DropForeignKey
ALTER TABLE "wishes" DROP CONSTRAINT "wishes_source_note_id_fkey";

-- DropIndex
DROP INDEX "couple_members_couple_id_status_idx";

-- DropIndex
DROP INDEX "couple_members_couple_id_user_id_key";

-- DropIndex
DROP INDEX "couple_members_user_id_status_idx";

-- DropIndex
DROP INDEX "couples_status_deleted_at_idx";

-- DropIndex
DROP INDEX "current_statuses_author_id_state_starts_at_idx";

-- DropIndex
DROP INDEX "current_statuses_couple_id_state_expires_at_idx";

-- DropIndex
DROP INDEX "notes_couple_id_deleted_at_idx";

-- DropIndex
DROP INDEX "notes_couple_id_is_pinned_position_idx";

-- DropIndex
DROP INDEX "notes_couple_id_status_show_at_idx";

-- DropIndex
DROP INDEX "notes_recipient_id_status_created_at_idx";

-- DropIndex
DROP INDEX "notes_source_status_id_key";

-- DropIndex
DROP INDEX "users_status_deleted_at_idx";

-- AlterTable
ALTER TABLE "couple_members" DROP COLUMN "left_at",
DROP COLUMN "nickname_in_relationship",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "couples" DROP COLUMN "cover_media_id",
DROP COLUMN "deleted_at",
DROP COLUMN "status",
DROP COLUMN "theme";

-- Keep the current status history while removing old status variants.
UPDATE "current_statuses"
SET "kind" = CASE
  WHEN "kind" = 'TIRED' THEN 'RESTING'::"CurrentStatusKind"
  WHEN "kind" = 'NEED_HUG' THEN 'MISS_YOU'::"CurrentStatusKind"
  WHEN "kind" = 'TALK_LATER' THEN 'BUSY'::"CurrentStatusKind"
  WHEN "kind" = 'CUSTOM' THEN 'HAPPY'::"CurrentStatusKind"
  ELSE "kind"
END;

UPDATE "current_statuses"
SET "archived_at" = COALESCE("archived_at", "updated_at")
WHERE "state" <> 'ACTIVE';

-- AlterTable
ALTER TABLE "current_statuses"
ALTER COLUMN "kind" DROP DEFAULT,
ALTER COLUMN "kind" TYPE VARCHAR(32) USING "kind"::text,
DROP COLUMN "mood",
DROP COLUMN "needs_response",
DROP COLUMN "scene",
DROP COLUMN "state";

-- Only delivered notes belong to the new便笺匣.
DELETE FROM "notes"
WHERE "status" NOT IN ('VISIBLE', 'VIEWED');

ALTER TABLE "notes" ADD COLUMN "read_at" TIMESTAMPTZ(3);

UPDATE "notes"
SET "read_at" = "viewed_at"
WHERE "status" = 'VIEWED';

-- AlterTable
ALTER TABLE "notes" DROP COLUMN "archived_at",
DROP COLUMN "color",
DROP COLUMN "deleted_at",
DROP COLUMN "expires_at",
DROP COLUMN "is_pinned",
DROP COLUMN "keep_after_viewed",
DROP COLUMN "position",
DROP COLUMN "show_at",
DROP COLUMN "source_status_id",
DROP COLUMN "status",
DROP COLUMN "type",
DROP COLUMN "viewed_at",
DROP COLUMN "visible_at";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatar_media_id",
DROP COLUMN "deleted_at",
DROP COLUMN "last_login_at",
DROP COLUMN "status",
DROP COLUMN "version";

-- DropTable
DROP TABLE "anniversaries";

-- DropTable
DROP TABLE "anniversary_reminders";

-- DropTable
DROP TABLE "annual_review_contributions";

-- DropTable
DROP TABLE "annual_reviews";

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "calm_letters";

-- DropTable
DROP TABLE "capsule_media";

-- DropTable
DROP TABLE "capsule_messages";

-- DropTable
DROP TABLE "capsule_open_records";

-- DropTable
DROP TABLE "capsules";

-- DropTable
DROP TABLE "comments";

-- DropTable
DROP TABLE "content_conversions";

-- DropTable
DROP TABLE "content_revisions";

-- DropTable
DROP TABLE "daily_entries";

-- DropTable
DROP TABLE "daily_prompts";

-- DropTable
DROP TABLE "daily_rituals";

-- DropTable
DROP TABLE "export_jobs";

-- DropTable
DROP TABLE "idempotency_records";

-- DropTable
DROP TABLE "media_assets";

-- DropTable
DROP TABLE "memories";

-- DropTable
DROP TABLE "memory_media";

-- DropTable
DROP TABLE "memory_perspectives";

-- DropTable
DROP TABLE "memory_resurfaces";

-- DropTable
DROP TABLE "memory_tags";

-- DropTable
DROP TABLE "mood_entries";

-- DropTable
DROP TABLE "notifications";

-- DropTable
DROP TABLE "outbox_events";

-- DropTable
DROP TABLE "places";

-- DropTable
DROP TABLE "plans";

-- DropTable
DROP TABLE "reactions";

-- DropTable
DROP TABLE "recycle_bin_items";

-- DropTable
DROP TABLE "scheduled_events";

-- DropTable
DROP TABLE "tags";

-- DropTable
DROP TABLE "touch_events";

-- DropTable
DROP TABLE "wish_media";

-- DropTable
DROP TABLE "wish_updates";

-- DropTable
DROP TABLE "wishes";

-- DropEnum
DROP TYPE "AnniversaryLeapDayRule";

-- DropEnum
DROP TYPE "AnniversaryRepeat";

-- DropEnum
DROP TYPE "AnniversaryType";

-- DropEnum
DROP TYPE "AnnualReviewStatus";

-- DropEnum
DROP TYPE "CalmLetterPurpose";

-- DropEnum
DROP TYPE "CalmLetterStatus";

-- DropEnum
DROP TYPE "CapsuleStatus";

-- DropEnum
DROP TYPE "CapsuleType";

-- DropEnum
DROP TYPE "CapsuleUnlockRule";

-- DropEnum
DROP TYPE "ConversionSourceType";

-- DropEnum
DROP TYPE "ConversionTargetType";

-- DropEnum
DROP TYPE "CoupleMemberStatus";

-- DropEnum
DROP TYPE "CoupleStatus";

-- DropEnum
DROP TYPE "CurrentStatusKind";

-- DropEnum
DROP TYPE "CurrentStatusState";

-- DropEnum
DROP TYPE "DailyEntryStatus";

-- DropEnum
DROP TYPE "DailyPromptSource";

-- DropEnum
DROP TYPE "DailyRitualStatus";

-- DropEnum
DROP TYPE "ExportFormat";

-- DropEnum
DROP TYPE "ExportJobStatus";

-- DropEnum
DROP TYPE "MediaKind";

-- DropEnum
DROP TYPE "MediaStatus";

-- DropEnum
DROP TYPE "MemoryMediaRole";

-- DropEnum
DROP TYPE "MemoryResurfaceReason";

-- DropEnum
DROP TYPE "MemoryStatus";

-- DropEnum
DROP TYPE "NoteStatus";

-- DropEnum
DROP TYPE "NoteType";

-- DropEnum
DROP TYPE "NotificationStatus";

-- DropEnum
DROP TYPE "OutboxEventStatus";

-- DropEnum
DROP TYPE "PlaceFutureState";

-- DropEnum
DROP TYPE "PlaceHistoryState";

-- DropEnum
DROP TYPE "PlaceStatus";

-- DropEnum
DROP TYPE "PlanStatus";

-- DropEnum
DROP TYPE "ReactionTargetType";

-- DropEnum
DROP TYPE "RecycleBinItemStatus";

-- DropEnum
DROP TYPE "RecycleBinResourceType";

-- DropEnum
DROP TYPE "RecycleBinVisibility";

-- DropEnum
DROP TYPE "ScheduledEventStatus";

-- DropEnum
DROP TYPE "ScheduledEventType";

-- DropEnum
DROP TYPE "TouchEventKind";

-- DropEnum
DROP TYPE "UserStatus";

-- DropEnum
DROP TYPE "WishCategory";

-- DropEnum
DROP TYPE "WishStatus";

-- CreateIndex
CREATE INDEX "couple_members_couple_id_idx" ON "couple_members"("couple_id");

-- CreateIndex
CREATE INDEX "current_statuses_couple_id_author_id_archived_at_expires_at_idx" ON "current_statuses"("couple_id", "author_id", "archived_at", "expires_at");

-- CreateIndex
CREATE INDEX "notes_couple_id_created_at_idx" ON "notes"("couple_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notes_recipient_id_read_at_created_at_idx" ON "notes"("recipient_id", "read_at", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
