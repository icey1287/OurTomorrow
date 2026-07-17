import { promises as fileSystem } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { DataStatusService } from "./data-status.service";

const NOW = new Date("2026-07-17T08:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fileSystem.rm(root, { recursive: true, force: true })),
  );
});

async function fixture(lastSuccess?: string, heartbeatState = "RUNNING") {
  const root = await fileSystem.mkdtemp(
    path.join(os.tmpdir(), "our-tomorrow-status-"),
  );
  roots.push(root);
  const backupStatusPath = path.join(root, "last-success");
  const workerHeartbeatPath = path.join(root, "worker-heartbeat.json");
  if (lastSuccess) await fileSystem.writeFile(backupStatusPath, lastSuccess);
  await fileSystem.writeFile(
    workerHeartbeatPath,
    JSON.stringify({
      version: 1,
      state: heartbeatState,
      updatedAt: "2026-07-17T07:59:50.000Z",
    }),
  );
  const prisma = {
    scheduledEvent: {
      count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      findFirst: vi.fn().mockResolvedValue({ runAt: NOW }),
    },
    outboxEvent: {
      count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0),
      findFirst: vi.fn().mockResolvedValue({ availableAt: NOW }),
    },
  };
  const identities = { current: vi.fn().mockResolvedValue({}) };
  const clock = { now: () => NOW } as Clock;
  const config = {
    get(key: keyof Environment) {
      if (key === "BACKUP_STATUS_PATH") return backupStatusPath;
      if (key === "BACKUP_MAX_AGE_SECONDS") return 36 * 60 * 60;
      if (key === "MEDIA_STORAGE_PATH") return root;
      if (key === "WORKER_HEARTBEAT_PATH") return workerHeartbeatPath;
      if (key === "WORKER_HEARTBEAT_MAX_AGE_SECONDS") return 60;
      throw new Error(`Unexpected config key ${key}`);
    },
  } as unknown as ConfigService<Environment, true>;
  return new DataStatusService(
    prisma as never,
    identities as never,
    clock,
    config,
  );
}

describe("DataStatusService", () => {
  it("reports a recent backup and operational counts without paths or credentials", async () => {
    const service = await fixture("2026-07-17T07:30:00Z\n");
    const result = await service.get("boy");

    expect(result).toMatchObject({
      backup: {
        status: "HEALTHY",
        lastSuccessAt: "2026-07-17T07:30:00.000Z",
      },
      worker: {
        status: "HEALTHY",
        lastHeartbeatAt: "2026-07-17T07:59:50.000Z",
      },
      queues: {
        scheduledPending: 2,
        scheduledFailed: 1,
        outboxPending: 3,
        outboxFailed: 0,
      },
      exports: { enabled: true, formatVersion: 1, retentionDays: 7 },
      recycleBin: { enabled: true, retentionDays: 30 },
    });
    expect(JSON.stringify(result)).not.toContain("last-success");
    expect(JSON.stringify(result)).not.toContain("repository");
  });

  it("treats a missing or malformed backup marker as unknown", async () => {
    const service = await fixture("private backup secret");
    const result = await service.get("girl");
    expect(result.backup).toMatchObject({
      status: "UNKNOWN",
      lastSuccessAt: null,
    });
  });
});
