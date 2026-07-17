import { randomUUID } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";

type HeartbeatState = "RUNNING" | "STOPPED";

@Injectable()
export class WorkerHeartbeatService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private readonly heartbeatPath: string;
  private readonly intervalMs: number;
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.heartbeatPath = config.get("WORKER_HEARTBEAT_PATH", { infer: true });
    this.intervalMs = config.get("WORKER_HEARTBEAT_INTERVAL_MS", {
      infer: true,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.heartbeatPath) return;
    await this.write("RUNNING");
    this.timer = setInterval(() => void this.write("RUNNING"), this.intervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.heartbeatPath) await this.write("STOPPED");
  }

  private async write(state: HeartbeatState): Promise<void> {
    const temporaryPath = `${this.heartbeatPath}.${process.pid}.tmp`;
    try {
      await fileSystem.mkdir(path.dirname(this.heartbeatPath), {
        recursive: true,
        mode: 0o700,
      });
      await fileSystem.writeFile(
        temporaryPath,
        JSON.stringify({
          version: 1,
          state,
          updatedAt: this.clock.now().toISOString(),
          workerId: this.workerId,
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      await fileSystem.rename(temporaryPath, this.heartbeatPath);
    } catch {
      await fileSystem.rm(temporaryPath, { force: true }).catch(() => {});
      this.logger.error("Worker heartbeat update failed");
    }
  }
}
