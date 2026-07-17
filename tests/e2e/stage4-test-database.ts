import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const WORKSPACE_ROOT = resolve(__dirname, "../..");

const RESET_SQL = `
TRUNCATE TABLE
  content_conversions,
  capsule_open_records,
  capsule_media,
  capsule_messages,
  capsules,
  anniversary_reminders,
  plans,
  wish_updates,
  wish_media,
  wishes,
  anniversaries,
  memory_resurfaces,
  annual_review_contributions,
  annual_reviews,
  memory_media,
  memory_perspectives,
  memory_tags,
  comments,
  reactions,
  memories,
  media_assets,
  places,
  tags,
  notifications,
  scheduled_events,
  outbox_events,
  idempotency_records,
  content_revisions,
  notes,
  current_statuses,
  daily_entries,
  mood_entries
RESTART IDENTITY CASCADE;
`;

export function stageFourResetUnavailableReason(): string | null {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    return "Stage 4 E2E requires E2E_DATABASE_URL for an isolated PostgreSQL database.";
  }
  if (process.env.E2E_RESET_DATABASE !== "true") {
    return "Stage 4 E2E requires the explicit E2E_RESET_DATABASE=true reset opt-in.";
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

export function resetStageFourState(): void {
  const unavailableReason = stageFourResetUnavailableReason();
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
