import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const WORKSPACE_ROOT = resolve(__dirname, "../..");

const RESET_SQL = `
UPDATE users SET avatar_media_id = NULL WHERE avatar_media_id IS NOT NULL;
UPDATE couples SET cover_media_id = NULL WHERE cover_media_id IS NOT NULL;

TRUNCATE TABLE
  notifications,
  scheduled_events,
  outbox_events,
  audit_logs,
  content_revisions,
  export_jobs,
  idempotency_records,
  recycle_bin_items,
  places,
  memories,
  memory_perspectives,
  memory_media,
  tags,
  memory_tags,
  comments,
  reactions,
  memory_resurfaces,
  annual_reviews,
  annual_review_contributions,
  current_statuses,
  notes,
  daily_prompts,
  daily_entries,
  mood_entries,
  touch_events,
  daily_rituals,
  calm_letters,
  wishes,
  wish_media,
  wish_updates,
  plans,
  anniversaries,
  anniversary_reminders,
  capsules,
  capsule_messages,
  capsule_media,
  capsule_open_records,
  content_conversions
RESTART IDENTITY CASCADE;

DELETE FROM media_assets;
DELETE FROM couple_members
WHERE couple_id <> '00000000-0000-4000-8000-000000000001'
   OR user_id NOT IN (
     '00000000-0000-4000-8000-000000000101',
     '00000000-0000-4000-8000-000000000102'
   );
DELETE FROM couples
WHERE id <> '00000000-0000-4000-8000-000000000001';
DELETE FROM users
WHERE id NOT IN (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);
`;

export function stageSixResetUnavailableReason(): string | null {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    return "Stage 6 E2E requires E2E_DATABASE_URL for an isolated PostgreSQL database.";
  }
  if (process.env.E2E_RESET_DATABASE !== "true") {
    return "Stage 6 E2E requires the explicit E2E_RESET_DATABASE=true reset opt-in.";
  }

  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return "E2E_DATABASE_URL must use PostgreSQL.";
    }
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!/(?:test|e2e)/i.test(databaseName)) {
      return "Refusing to reset a database whose name does not contain test or e2e.";
    }
  } catch {
    return "E2E_DATABASE_URL is not a valid PostgreSQL URL.";
  }

  return null;
}

export function resetStageSixState(): void {
  const unavailableReason = stageSixResetUnavailableReason();
  if (unavailableReason) throw new Error(unavailableReason);

  execFileSync(
    "pnpm",
    [
      "--filter",
      "@our-tomorrow/api",
      "exec",
      "prisma",
      "db",
      "execute",
      "--schema",
      "prisma/schema.prisma",
      "--stdin",
    ],
    {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: process.env.E2E_DATABASE_URL,
      },
      input: RESET_SQL,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
