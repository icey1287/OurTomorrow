import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxEventStatus, ScheduledEventStatus } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";

export type DataStatusResponse = {
  serverNow: string;
  backup: {
    status: "HEALTHY" | "STALE" | "UNKNOWN";
    lastSuccessAt: string | null;
    maxAgeSeconds: number;
  };
  worker: {
    status: "HEALTHY" | "STALE" | "STOPPED" | "UNKNOWN";
    lastHeartbeatAt: string | null;
    maxAgeSeconds: number;
  };
  queues: {
    scheduledPending: number;
    scheduledFailed: number;
    scheduledOldestDueAt: string | null;
    outboxPending: number;
    outboxFailed: number;
    outboxOldestAvailableAt: string | null;
  };
  storage: {
    available: boolean;
    freeBytes: string | null;
  };
  exports: {
    enabled: true;
    formatVersion: 1;
    retentionDays: 7;
  };
  recycleBin: {
    enabled: true;
    retentionDays: 30;
    purgeCoolingOffDays: 7;
  };
};

function parseBackupTimestamp(value: string): Date | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(normalized)) {
    return null;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

@Injectable()
export class DataStatusService {
  private readonly backupStatusPath: string;
  private readonly backupMaxAgeSeconds: number;
  private readonly mediaStoragePath: string;
  private readonly workerHeartbeatPath: string;
  private readonly workerHeartbeatMaxAgeSeconds: number;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.backupStatusPath = config.get("BACKUP_STATUS_PATH", { infer: true });
    this.backupMaxAgeSeconds = config.get("BACKUP_MAX_AGE_SECONDS", {
      infer: true,
    });
    this.mediaStoragePath = path.resolve(
      config.get("MEDIA_STORAGE_PATH", { infer: true }),
    );
    this.workerHeartbeatPath = config.get("WORKER_HEARTBEAT_PATH", {
      infer: true,
    });
    this.workerHeartbeatMaxAgeSeconds = config.get(
      "WORKER_HEARTBEAT_MAX_AGE_SECONDS",
      { infer: true },
    );
  }

  async get(role: IdentityRole): Promise<DataStatusResponse> {
    await this.identities.current(role);
    const now = this.clock.now();
    const [backup, worker, queues, storage] = await Promise.all([
      this.backupStatus(now),
      this.workerStatus(now),
      this.queueStatus(),
      this.storageStatus(),
    ]);
    return {
      serverNow: now.toISOString(),
      backup,
      worker,
      queues,
      storage,
      exports: { enabled: true, formatVersion: 1, retentionDays: 7 },
      recycleBin: {
        enabled: true,
        retentionDays: 30,
        purgeCoolingOffDays: 7,
      },
    };
  }

  private async workerStatus(now: Date): Promise<DataStatusResponse["worker"]> {
    const unknown: DataStatusResponse["worker"] = {
      status: "UNKNOWN",
      lastHeartbeatAt: null,
      maxAgeSeconds: this.workerHeartbeatMaxAgeSeconds,
    };
    if (!this.workerHeartbeatPath) return unknown;
    const content = await fileSystem
      .readFile(this.workerHeartbeatPath, "utf8")
      .catch(() => null);
    if (!content) return unknown;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (
        parsed.version !== 1 ||
        !["RUNNING", "STOPPED"].includes(String(parsed.state)) ||
        typeof parsed.updatedAt !== "string"
      ) {
        return unknown;
      }
      const updatedAt = new Date(parsed.updatedAt);
      if (Number.isNaN(updatedAt.valueOf()) || updatedAt > now) return unknown;
      if (parsed.state === "STOPPED") {
        return {
          status: "STOPPED",
          lastHeartbeatAt: updatedAt.toISOString(),
          maxAgeSeconds: this.workerHeartbeatMaxAgeSeconds,
        };
      }
      const ageSeconds = Math.floor(
        (now.valueOf() - updatedAt.valueOf()) / 1_000,
      );
      return {
        status:
          ageSeconds <= this.workerHeartbeatMaxAgeSeconds ? "HEALTHY" : "STALE",
        lastHeartbeatAt: updatedAt.toISOString(),
        maxAgeSeconds: this.workerHeartbeatMaxAgeSeconds,
      };
    } catch {
      return unknown;
    }
  }

  private async backupStatus(now: Date): Promise<DataStatusResponse["backup"]> {
    if (!this.backupStatusPath) {
      return {
        status: "UNKNOWN",
        lastSuccessAt: null,
        maxAgeSeconds: this.backupMaxAgeSeconds,
      };
    }
    const content = await fileSystem
      .readFile(this.backupStatusPath, "utf8")
      .catch(() => null);
    const lastSuccess = content ? parseBackupTimestamp(content) : null;
    if (!lastSuccess || lastSuccess > now) {
      return {
        status: "UNKNOWN",
        lastSuccessAt: null,
        maxAgeSeconds: this.backupMaxAgeSeconds,
      };
    }
    const ageSeconds = Math.floor(
      (now.valueOf() - lastSuccess.valueOf()) / 1_000,
    );
    return {
      status: ageSeconds <= this.backupMaxAgeSeconds ? "HEALTHY" : "STALE",
      lastSuccessAt: lastSuccess.toISOString(),
      maxAgeSeconds: this.backupMaxAgeSeconds,
    };
  }

  private async queueStatus(): Promise<DataStatusResponse["queues"]> {
    const [
      scheduledPending,
      scheduledFailed,
      oldestScheduled,
      outboxPending,
      outboxFailed,
      oldestOutbox,
    ] = await Promise.all([
      this.prisma.scheduledEvent.count({
        where: {
          status: {
            in: [
              ScheduledEventStatus.PENDING,
              ScheduledEventStatus.RETRYING,
              ScheduledEventStatus.RUNNING,
            ],
          },
        },
      }),
      this.prisma.scheduledEvent.count({
        where: { status: ScheduledEventStatus.FAILED },
      }),
      this.prisma.scheduledEvent.findFirst({
        where: {
          status: {
            in: [
              ScheduledEventStatus.PENDING,
              ScheduledEventStatus.RETRYING,
              ScheduledEventStatus.RUNNING,
            ],
          },
        },
        orderBy: [{ runAt: "asc" }, { id: "asc" }],
        select: { runAt: true },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: {
            in: [
              OutboxEventStatus.PENDING,
              OutboxEventStatus.RETRYING,
              OutboxEventStatus.RUNNING,
            ],
          },
        },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.FAILED },
      }),
      this.prisma.outboxEvent.findFirst({
        where: {
          status: {
            in: [
              OutboxEventStatus.PENDING,
              OutboxEventStatus.RETRYING,
              OutboxEventStatus.RUNNING,
            ],
          },
        },
        orderBy: [{ availableAt: "asc" }, { id: "asc" }],
        select: { availableAt: true },
      }),
    ]);
    return {
      scheduledPending,
      scheduledFailed,
      scheduledOldestDueAt: oldestScheduled?.runAt.toISOString() ?? null,
      outboxPending,
      outboxFailed,
      outboxOldestAvailableAt: oldestOutbox?.availableAt.toISOString() ?? null,
    };
  }

  private async storageStatus(): Promise<DataStatusResponse["storage"]> {
    try {
      const status = await fileSystem.statfs(this.mediaStoragePath);
      return {
        available: true,
        freeBytes: (BigInt(status.bavail) * BigInt(status.bsize)).toString(),
      };
    } catch {
      return { available: false, freeBytes: null };
    }
  }
}
