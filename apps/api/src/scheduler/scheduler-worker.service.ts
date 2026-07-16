import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class SchedulerWorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerWorkerService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  start(): void {
    const interval = this.config.get("WORKER_POLL_INTERVAL_MS", {
      infer: true,
    });
    this.logger.log(`Scheduler worker started (poll interval ${interval}ms)`);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), interval);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const dueCount = await this.prisma.scheduledEvent.count({
        where: {
          status: { in: ["PENDING", "RETRYING"] },
          runAt: { lte: this.clock.now() },
        },
      });
      if (dueCount > 0) {
        this.logger.debug(
          `${dueCount} scheduled event(s) are due; handlers arrive with domain phases`,
        );
      }
    } catch (error) {
      this.logger.error(
        "Scheduler poll failed",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.polling = false;
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
