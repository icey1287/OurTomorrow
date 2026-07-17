import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const WORKSPACE_ROOT = resolve(__dirname, "../..");

const RESET_SQL = `
DELETE FROM reactions WHERE target_type = 'NOTE';
DELETE FROM notifications;
DELETE FROM scheduled_events;
DELETE FROM outbox_events;
DELETE FROM notes;
DELETE FROM current_statuses;
DELETE FROM daily_entries;
DELETE FROM mood_entries;
`;

export function stageThreeResetUnavailableReason(): string | null {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    return "Stage 3 E2E requires E2E_DATABASE_URL for an isolated PostgreSQL database.";
  }
  if (process.env.E2E_RESET_DATABASE !== "true") {
    return "Stage 3 E2E requires the explicit E2E_RESET_DATABASE=true reset opt-in.";
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

export function resetStageThreeState(): void {
  const unavailableReason = stageThreeResetUnavailableReason();
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
