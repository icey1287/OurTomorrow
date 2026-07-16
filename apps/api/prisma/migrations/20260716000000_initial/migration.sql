-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CoupleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CoupleMemberStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "InviteCodeStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'QUARANTINED', 'DELETED');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MemoryMediaRole" AS ENUM ('COVER', 'GALLERY', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "MemoryResurfaceReason" AS ENUM ('ON_THIS_DAY', 'RANDOM', 'FIRST_UPLOAD', 'PLACE', 'SEASON', 'COMPLETE_PERSPECTIVES');

-- CreateEnum
CREATE TYPE "AnnualReviewStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('VISITED', 'LIVED', 'FIRST_TIME', 'WANT_TO_GO', 'PLANNED', 'DEPARTING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReactionTargetType" AS ENUM ('MEMORY', 'COMMENT', 'NOTE');

-- CreateEnum
CREATE TYPE "CurrentStatusKind" AS ENUM ('BUSY', 'COMMUTING', 'RESTING', 'TIRED', 'HAPPY', 'NEED_HUG', 'TALK_LATER', 'HOME', 'MISS_YOU', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CurrentStatusState" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('LOVE', 'REMINDER', 'THANKS', 'APOLOGY', 'TALK_LATER', 'DO_TOGETHER', 'SURPRISE');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'VISIBLE', 'VIEWED', 'ARCHIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DailyPromptSource" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DailyEntryStatus" AS ENUM ('DRAFT', 'EDITING', 'SUBMITTED', 'WAITING_FOR_PARTNER', 'BOTH_SUBMITTED', 'REVEALED');

-- CreateEnum
CREATE TYPE "TouchEventKind" AS ENUM ('HUG', 'MISS_YOU', 'KISS', 'CHEER', 'REST', 'TELL_ME_WHEN_HOME', 'I_AM_HERE');

-- CreateEnum
CREATE TYPE "DailyRitualStatus" AS ENUM ('PROPOSED', 'SELECTED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CalmLetterPurpose" AS ENUM ('BE_HEARD', 'DISCUSS_LATER', 'SOLVE_TOGETHER', 'NEED_SPACE', 'READY_TO_OPEN');

-- CreateEnum
CREATE TYPE "CalmLetterStatus" AS ENUM ('DRAFT', 'LOCKED', 'AVAILABLE', 'OPENED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WishCategory" AS ENUM ('TRAVEL', 'FOOD', 'LIFE', 'LEARNING', 'COMMEMORATION', 'FAMILY', 'PHOTOGRAPHY', 'ADVENTURE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WishStatus" AS ENUM ('IDEA', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CONVERTED_TO_MEMORY');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnniversaryType" AS ENUM ('RELATIONSHIP', 'FIRST_MEETING', 'BIRTHDAY', 'MARRIAGE', 'MOVING', 'PET_BIRTHDAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AnniversaryRepeat" AS ENUM ('NONE', 'YEARLY');

-- CreateEnum
CREATE TYPE "CapsuleType" AS ENUM ('TO_PARTNER', 'TO_SELF', 'TO_BOTH', 'JOINT', 'ANNIVERSARY', 'EVENT', 'FUTURE_LETTER');

-- CreateEnum
CREATE TYPE "CapsuleUnlockRule" AS ENUM ('AT_TIME', 'ANNIVERSARY', 'WISH_COMPLETION', 'MANUAL_CONDITION');

-- CreateEnum
CREATE TYPE "CapsuleStatus" AS ENUM ('DRAFT', 'SEALED', 'LOCKED', 'DUE', 'UNLOCKED', 'OPENED', 'CONVERTED_TO_MEMORY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduledEventType" AS ENUM ('NOTE_SHOW', 'NOTE_EXPIRE', 'STATUS_EXPIRE', 'CAPSULE_DUE', 'ANNIVERSARY_REMINDER', 'DAILY_PROMPT', 'MEMORY_RESURFACE', 'ANNUAL_REVIEW', 'BACKUP_CHECK', 'OUTBOX_RETRY');

-- CreateEnum
CREATE TYPE "ScheduledEventStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('JSON', 'ZIP');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "avatar_media_id" UUID,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couples" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "start_date" DATE NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    "signature" VARCHAR(280),
    "cover_media_id" UUID,
    "theme" VARCHAR(64) NOT NULL DEFAULT 'system',
    "status" "CoupleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "couples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couple_members" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "nickname_in_relationship" VARCHAR(100),
    "status" "CoupleMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "couple_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "code_hash" VARCHAR(255) NOT NULL,
    "status" "InviteCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "accepted_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "couple_id" UUID,
    "token_hash" VARCHAR(255) NOT NULL,
    "csrf_hash" VARCHAR(255) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "dedupe_key" VARCHAR(180),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_events" (
    "id" UUID NOT NULL,
    "couple_id" UUID,
    "type" "ScheduledEventType" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "run_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ScheduledEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(120),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "scheduled_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "couple_id" UUID,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "couple_id" UUID,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(80),
    "resource_id" UUID,
    "request_id" VARCHAR(128),
    "ip_address" INET,
    "user_agent" VARCHAR(512),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_revisions" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "author_id" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "format" "ExportFormat" NOT NULL DEFAULT 'ZIP',
    "storage_key" VARCHAR(512),
    "checksum" VARCHAR(128),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "thumbnail_key" VARCHAR(512),
    "checksum_sha256" VARCHAR(64),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "PlaceStatus" NOT NULL DEFAULT 'VISITED',
    "first_visited_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT,
    "happened_at" TIMESTAMPTZ(3) NOT NULL,
    "place_id" UUID,
    "cover_media_id" UUID,
    "mood" VARCHAR(80),
    "is_first_time" BOOLEAN NOT NULL DEFAULT false,
    "first_time_label" VARCHAR(160),
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "MemoryStatus" NOT NULL DEFAULT 'PUBLISHED',
    "source_wish_id" UUID,
    "source_capsule_id" UUID,
    "source_note_id" UUID,
    "source_anniversary_id" UUID,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_perspectives" (
    "id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "mood" VARCHAR(80),
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memory_perspectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_media" (
    "memory_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "role" "MemoryMediaRole" NOT NULL DEFAULT 'GALLERY',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_media_pkey" PRIMARY KEY ("memory_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "normalized_name" VARCHAR(64) NOT NULL,
    "color" VARCHAR(32),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_tags" (
    "memory_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "memory_tags_pkey" PRIMARY KEY ("memory_id","tag_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "target_type" "ReactionTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_resurfaces" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "memory_id" UUID NOT NULL,
    "reason" "MemoryResurfaceReason" NOT NULL,
    "displayed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_at" TIMESTAMPTZ(3),

    CONSTRAINT "memory_resurfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_reviews" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "AnnualReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "statistics" JSONB NOT NULL DEFAULT '{}',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "next_year_letter" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "annual_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_review_contributions" (
    "id" UUID NOT NULL,
    "annual_review_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "selected_media_id" UUID,
    "message" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "annual_review_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_statuses" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "CurrentStatusKind" NOT NULL DEFAULT 'CUSTOM',
    "state" "CurrentStatusState" NOT NULL DEFAULT 'ACTIVE',
    "message" VARCHAR(280),
    "mood" VARCHAR(80),
    "scene" VARCHAR(120),
    "needs_response" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "current_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "type" "NoteType" NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "color" VARCHAR(32),
    "icon" VARCHAR(32),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "keep_after_viewed" BOOLEAN NOT NULL DEFAULT true,
    "show_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "viewed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "source_status_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_prompts" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "prompt_date" DATE NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "source" "DailyPromptSource" NOT NULL DEFAULT 'SYSTEM',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "prompt_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "postscript" TEXT,
    "status" "DailyEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(3),
    "revealed_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_entries" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "mood" VARCHAR(80) NOT NULL,
    "note" VARCHAR(500),
    "visible_to_partner" BOOLEAN NOT NULL DEFAULT true,
    "wants_response" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "touch_events" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" "TouchEventKind" NOT NULL,
    "message" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "touch_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_rituals" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "ritual_date" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "status" "DailyRitualStatus" NOT NULL DEFAULT 'PROPOSED',
    "chosen_by" UUID,
    "completion_note" VARCHAR(500),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_rituals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calm_letters" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "purpose" "CalmLetterPurpose" NOT NULL,
    "status" "CalmLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "unlock_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "calm_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishes" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "expectation" TEXT,
    "category" "WishCategory" NOT NULL DEFAULT 'CUSTOM',
    "status" "WishStatus" NOT NULL DEFAULT 'IDEA',
    "place_id" UUID,
    "planned_for" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "converted_at" TIMESTAMPTZ(3),
    "source_note_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "wishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_updates" (
    "id" UUID NOT NULL,
    "wish_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "from_status" "WishStatus",
    "to_status" "WishStatus",
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "wish_id" UUID,
    "anniversary_id" UUID,
    "place_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "itinerary" TEXT,
    "preparations" JSONB NOT NULL DEFAULT '[]',
    "participants" JSONB NOT NULL DEFAULT '[]',
    "expectation" TEXT,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "reminder_at" TIMESTAMPTZ(3),
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anniversaries" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" "AnniversaryType" NOT NULL DEFAULT 'CUSTOM',
    "date" DATE NOT NULL,
    "repeat" "AnniversaryRepeat" NOT NULL DEFAULT 'YEARLY',
    "reminder_days_before" INTEGER NOT NULL DEFAULT 0,
    "background_media_id" UUID,
    "source_note_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "anniversaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsules" (
    "id" UUID NOT NULL,
    "couple_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" "CapsuleType" NOT NULL,
    "unlock_rule" "CapsuleUnlockRule" NOT NULL,
    "status" "CapsuleStatus" NOT NULL DEFAULT 'DRAFT',
    "unlock_at" TIMESTAMPTZ(3),
    "anniversary_id" UUID,
    "wish_id" UUID,
    "unlock_condition" VARCHAR(500),
    "requires_both_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "sealed_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "unlocked_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "converted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "capsules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_messages" (
    "id" UUID NOT NULL,
    "capsule_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "capsule_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capsule_media" (
    "capsule_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "capsule_media_pkey" PRIMARY KEY ("capsule_id","media_asset_id")
);

-- CreateTable
CREATE TABLE "capsule_open_records" (
    "id" UUID NOT NULL,
    "capsule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_open_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_status_deleted_at_idx" ON "users"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "couples_status_deleted_at_idx" ON "couples"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "couple_members_user_id_key" ON "couple_members"("user_id");

-- CreateIndex
CREATE INDEX "couple_members_couple_id_status_idx" ON "couple_members"("couple_id", "status");

-- CreateIndex
CREATE INDEX "couple_members_user_id_status_idx" ON "couple_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "couple_members_couple_id_user_id_key" ON "couple_members"("couple_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "couple_members_couple_id_slot_key" ON "couple_members"("couple_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_hash_key" ON "invite_codes"("code_hash");

-- CreateIndex
CREATE INDEX "invite_codes_couple_id_status_expires_at_idx" ON "invite_codes"("couple_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_expires_at_idx" ON "sessions"("user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_status_created_at_idx" ON "notifications"("recipient_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_couple_id_created_at_idx" ON "notifications"("couple_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scheduled_events_status_run_at_idx" ON "scheduled_events"("status", "run_at");

-- CreateIndex
CREATE INDEX "scheduled_events_couple_id_status_run_at_idx" ON "scheduled_events"("couple_id", "status", "run_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "audit_logs_couple_id_created_at_idx" ON "audit_logs"("couple_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "content_revisions_couple_id_created_at_idx" ON "content_revisions"("couple_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_revisions_resource_type_resource_id_version_key" ON "content_revisions"("resource_type", "resource_id", "version");

-- CreateIndex
CREATE INDEX "export_jobs_couple_id_status_created_at_idx" ON "export_jobs"("couple_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "export_jobs_status_created_at_idx" ON "export_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_couple_id_status_created_at_idx" ON "media_assets"("couple_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "media_assets_couple_id_deleted_at_idx" ON "media_assets"("couple_id", "deleted_at");

-- CreateIndex
CREATE INDEX "places_couple_id_status_deleted_at_idx" ON "places"("couple_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "places_couple_id_name_idx" ON "places"("couple_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "memories_source_wish_id_key" ON "memories"("source_wish_id");

-- CreateIndex
CREATE UNIQUE INDEX "memories_source_capsule_id_key" ON "memories"("source_capsule_id");

-- CreateIndex
CREATE UNIQUE INDEX "memories_source_note_id_key" ON "memories"("source_note_id");

-- CreateIndex
CREATE INDEX "memories_couple_id_happened_at_id_idx" ON "memories"("couple_id", "happened_at" DESC, "id");

-- CreateIndex
CREATE INDEX "memories_couple_id_status_deleted_at_idx" ON "memories"("couple_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "memories_couple_id_place_id_happened_at_idx" ON "memories"("couple_id", "place_id", "happened_at" DESC);

-- CreateIndex
CREATE INDEX "memories_couple_id_is_first_time_happened_at_idx" ON "memories"("couple_id", "is_first_time", "happened_at" DESC);

-- CreateIndex
CREATE INDEX "memories_couple_id_is_pinned_happened_at_idx" ON "memories"("couple_id", "is_pinned", "happened_at" DESC);

-- CreateIndex
CREATE INDEX "memories_source_anniversary_id_idx" ON "memories"("source_anniversary_id");

-- CreateIndex
CREATE INDEX "memory_perspectives_author_id_updated_at_idx" ON "memory_perspectives"("author_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "memory_perspectives_memory_id_author_id_key" ON "memory_perspectives"("memory_id", "author_id");

-- CreateIndex
CREATE INDEX "memory_media_memory_id_sort_order_idx" ON "memory_media"("memory_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tags_couple_id_normalized_name_key" ON "tags"("couple_id", "normalized_name");

-- CreateIndex
CREATE INDEX "memory_tags_tag_id_memory_id_idx" ON "memory_tags"("tag_id", "memory_id");

-- CreateIndex
CREATE INDEX "comments_memory_id_created_at_idx" ON "comments"("memory_id", "created_at");

-- CreateIndex
CREATE INDEX "reactions_couple_id_target_type_target_id_idx" ON "reactions"("couple_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_author_id_target_type_target_id_emoji_key" ON "reactions"("author_id", "target_type", "target_id", "emoji");

-- CreateIndex
CREATE INDEX "memory_resurfaces_couple_id_displayed_at_idx" ON "memory_resurfaces"("couple_id", "displayed_at" DESC);

-- CreateIndex
CREATE INDEX "memory_resurfaces_memory_id_displayed_at_idx" ON "memory_resurfaces"("memory_id", "displayed_at" DESC);

-- CreateIndex
CREATE INDEX "annual_reviews_couple_id_status_idx" ON "annual_reviews"("couple_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "annual_reviews_couple_id_year_key" ON "annual_reviews"("couple_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "annual_review_contributions_annual_review_id_author_id_key" ON "annual_review_contributions"("annual_review_id", "author_id");

-- CreateIndex
CREATE INDEX "current_statuses_couple_id_state_expires_at_idx" ON "current_statuses"("couple_id", "state", "expires_at");

-- CreateIndex
CREATE INDEX "current_statuses_author_id_state_starts_at_idx" ON "current_statuses"("author_id", "state", "starts_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notes_source_status_id_key" ON "notes"("source_status_id");

-- CreateIndex
CREATE INDEX "notes_couple_id_status_show_at_idx" ON "notes"("couple_id", "status", "show_at");

-- CreateIndex
CREATE INDEX "notes_recipient_id_status_created_at_idx" ON "notes"("recipient_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notes_couple_id_is_pinned_position_idx" ON "notes"("couple_id", "is_pinned", "position");

-- CreateIndex
CREATE INDEX "notes_couple_id_deleted_at_idx" ON "notes"("couple_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "daily_prompts_couple_id_prompt_date_key" ON "daily_prompts"("couple_id", "prompt_date");

-- CreateIndex
CREATE INDEX "daily_entries_couple_id_entry_date_status_idx" ON "daily_entries"("couple_id", "entry_date" DESC, "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_couple_id_author_id_entry_date_key" ON "daily_entries"("couple_id", "author_id", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_prompt_id_author_id_key" ON "daily_entries"("prompt_id", "author_id");

-- CreateIndex
CREATE INDEX "mood_entries_couple_id_entry_date_idx" ON "mood_entries"("couple_id", "entry_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mood_entries_couple_id_author_id_entry_date_key" ON "mood_entries"("couple_id", "author_id", "entry_date");

-- CreateIndex
CREATE INDEX "touch_events_sender_id_created_at_idx" ON "touch_events"("sender_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "touch_events_recipient_id_read_at_created_at_idx" ON "touch_events"("recipient_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "daily_rituals_couple_id_status_ritual_date_idx" ON "daily_rituals"("couple_id", "status", "ritual_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_rituals_couple_id_ritual_date_key" ON "daily_rituals"("couple_id", "ritual_date");

-- CreateIndex
CREATE INDEX "calm_letters_recipient_id_status_unlock_at_idx" ON "calm_letters"("recipient_id", "status", "unlock_at");

-- CreateIndex
CREATE INDEX "calm_letters_couple_id_deleted_at_idx" ON "calm_letters"("couple_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "wishes_source_note_id_key" ON "wishes"("source_note_id");

-- CreateIndex
CREATE INDEX "wishes_couple_id_status_updated_at_idx" ON "wishes"("couple_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "wishes_couple_id_planned_for_idx" ON "wishes"("couple_id", "planned_for");

-- CreateIndex
CREATE INDEX "wishes_couple_id_deleted_at_idx" ON "wishes"("couple_id", "deleted_at");

-- CreateIndex
CREATE INDEX "wish_updates_wish_id_created_at_idx" ON "wish_updates"("wish_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "plans_wish_id_key" ON "plans"("wish_id");

-- CreateIndex
CREATE INDEX "plans_couple_id_status_starts_at_idx" ON "plans"("couple_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "plans_anniversary_id_idx" ON "plans"("anniversary_id");

-- CreateIndex
CREATE INDEX "plans_couple_id_deleted_at_idx" ON "plans"("couple_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "anniversaries_source_note_id_key" ON "anniversaries"("source_note_id");

-- CreateIndex
CREATE INDEX "anniversaries_couple_id_date_idx" ON "anniversaries"("couple_id", "date");

-- CreateIndex
CREATE INDEX "anniversaries_couple_id_deleted_at_idx" ON "anniversaries"("couple_id", "deleted_at");

-- CreateIndex
CREATE INDEX "capsules_couple_id_status_unlock_at_idx" ON "capsules"("couple_id", "status", "unlock_at");

-- CreateIndex
CREATE INDEX "capsules_anniversary_id_idx" ON "capsules"("anniversary_id");

-- CreateIndex
CREATE INDEX "capsules_wish_id_idx" ON "capsules"("wish_id");

-- CreateIndex
CREATE INDEX "capsules_couple_id_deleted_at_idx" ON "capsules"("couple_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_messages_capsule_id_author_id_key" ON "capsule_messages"("capsule_id", "author_id");

-- CreateIndex
CREATE INDEX "capsule_media_capsule_id_sort_order_idx" ON "capsule_media"("capsule_id", "sort_order");

-- CreateIndex
CREATE INDEX "capsule_open_records_user_id_opened_at_idx" ON "capsule_open_records"("user_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "capsule_open_records_capsule_id_user_id_key" ON "capsule_open_records"("capsule_id", "user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couples" ADD CONSTRAINT "couples_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couple_members" ADD CONSTRAINT "couple_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_wish_id_fkey" FOREIGN KEY ("source_wish_id") REFERENCES "wishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_capsule_id_fkey" FOREIGN KEY ("source_capsule_id") REFERENCES "capsules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_note_id_fkey" FOREIGN KEY ("source_note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_anniversary_id_fkey" FOREIGN KEY ("source_anniversary_id") REFERENCES "anniversaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_perspectives" ADD CONSTRAINT "memory_perspectives_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_media" ADD CONSTRAINT "memory_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_tags" ADD CONSTRAINT "memory_tags_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_tags" ADD CONSTRAINT "memory_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_resurfaces" ADD CONSTRAINT "memory_resurfaces_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_resurfaces" ADD CONSTRAINT "memory_resurfaces_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_reviews" ADD CONSTRAINT "annual_reviews_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_review_contributions" ADD CONSTRAINT "annual_review_contributions_annual_review_id_fkey" FOREIGN KEY ("annual_review_id") REFERENCES "annual_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_review_contributions" ADD CONSTRAINT "annual_review_contributions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annual_review_contributions" ADD CONSTRAINT "annual_review_contributions_selected_media_id_fkey" FOREIGN KEY ("selected_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_statuses" ADD CONSTRAINT "current_statuses_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_statuses" ADD CONSTRAINT "current_statuses_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_source_status_id_fkey" FOREIGN KEY ("source_status_id") REFERENCES "current_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_prompts" ADD CONSTRAINT "daily_prompts_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_prompts" ADD CONSTRAINT "daily_prompts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "daily_prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touch_events" ADD CONSTRAINT "touch_events_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touch_events" ADD CONSTRAINT "touch_events_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "touch_events" ADD CONSTRAINT "touch_events_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rituals" ADD CONSTRAINT "daily_rituals_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_rituals" ADD CONSTRAINT "daily_rituals_chosen_by_fkey" FOREIGN KEY ("chosen_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calm_letters" ADD CONSTRAINT "calm_letters_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calm_letters" ADD CONSTRAINT "calm_letters_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calm_letters" ADD CONSTRAINT "calm_letters_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_source_note_id_fkey" FOREIGN KEY ("source_note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_updates" ADD CONSTRAINT "wish_updates_wish_id_fkey" FOREIGN KEY ("wish_id") REFERENCES "wishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_updates" ADD CONSTRAINT "wish_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_wish_id_fkey" FOREIGN KEY ("wish_id") REFERENCES "wishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_anniversary_id_fkey" FOREIGN KEY ("anniversary_id") REFERENCES "anniversaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anniversaries" ADD CONSTRAINT "anniversaries_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anniversaries" ADD CONSTRAINT "anniversaries_background_media_id_fkey" FOREIGN KEY ("background_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anniversaries" ADD CONSTRAINT "anniversaries_source_note_id_fkey" FOREIGN KEY ("source_note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anniversaries" ADD CONSTRAINT "anniversaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_couple_id_fkey" FOREIGN KEY ("couple_id") REFERENCES "couples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_anniversary_id_fkey" FOREIGN KEY ("anniversary_id") REFERENCES "anniversaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_wish_id_fkey" FOREIGN KEY ("wish_id") REFERENCES "wishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_messages" ADD CONSTRAINT "capsule_messages_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_messages" ADD CONSTRAINT "capsule_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_media" ADD CONSTRAINT "capsule_media_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_media" ADD CONSTRAINT "capsule_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_open_records" ADD CONSTRAINT "capsule_open_records_capsule_id_fkey" FOREIGN KEY ("capsule_id") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capsule_open_records" ADD CONSTRAINT "capsule_open_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants and queue indexes that Prisma's schema language cannot express.
ALTER TABLE "couple_members"
ADD CONSTRAINT "couple_members_slot_check"
CHECK ("slot" IN (1, 2));

CREATE UNIQUE INDEX "current_statuses_one_active_per_author_key"
ON "current_statuses" ("author_id")
WHERE "state" = 'ACTIVE';

CREATE INDEX "scheduled_events_due_queue_idx"
ON "scheduled_events" ("run_at", "id")
WHERE "status" IN ('PENDING', 'RETRYING');

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_dimensions_check"
CHECK (
    "size" >= 0
    AND ("width" IS NULL OR "width" > 0)
    AND ("height" IS NULL OR "height" > 0)
    AND ("duration" IS NULL OR "duration" >= 0)
);

ALTER TABLE "places"
ADD CONSTRAINT "places_coordinates_check"
CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR (
        "latitude" BETWEEN -90 AND 90
        AND "longitude" BETWEEN -180 AND 180
    )
);

ALTER TABLE "scheduled_events"
ADD CONSTRAINT "scheduled_events_attempts_check"
CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts");

ALTER TABLE "notes"
ADD CONSTRAINT "notes_distinct_participants_check"
CHECK ("author_id" <> "recipient_id");

ALTER TABLE "touch_events"
ADD CONSTRAINT "touch_events_distinct_participants_check"
CHECK ("sender_id" <> "recipient_id");

ALTER TABLE "calm_letters"
ADD CONSTRAINT "calm_letters_distinct_participants_check"
CHECK ("author_id" <> "recipient_id");

ALTER TABLE "capsules"
ADD CONSTRAINT "capsules_unlock_target_check"
CHECK (
    "status" = 'DRAFT'
    OR ("unlock_rule" = 'AT_TIME' AND "unlock_at" IS NOT NULL)
    OR ("unlock_rule" = 'ANNIVERSARY' AND "anniversary_id" IS NOT NULL)
    OR ("unlock_rule" = 'WISH_COMPLETION' AND "wish_id" IS NOT NULL)
    OR ("unlock_rule" = 'MANUAL_CONDITION' AND "unlock_condition" IS NOT NULL)
);
