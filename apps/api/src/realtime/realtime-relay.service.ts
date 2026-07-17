import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

const LOWEST_UUID = "00000000-0000-0000-0000-000000000000";

function objectPayload(value: Prisma.JsonValue): Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    ? (value as Prisma.JsonObject)
    : {};
}

function optionalString(
  payload: Prisma.JsonObject,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recipientIds(payload: Prisma.JsonObject): string[] | undefined {
  const many = payload.recipientIds;
  if (Array.isArray(many)) {
    const values = many.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (values.length > 0) return values;
  }
  const one = optionalString(payload, "recipientId");
  return one ? [one] : undefined;
}

@Injectable()
export class RealtimeRelayService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeRelayService.name);
  private timer?: NodeJS.Timeout;
  private polling = false;
  private cursorAt = new Date(0);
  private cursorId = LOWEST_UUID;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(RealtimeGateway)
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    this.cursorAt = new Date(this.clock.now().getTime() - 1_000);
    void this.poll();
    const interval = Math.max(
      250,
      Math.min(
        2_000,
        this.config.get("WORKER_POLL_INTERVAL_MS", { infer: true }),
      ),
    );
    this.timer = setInterval(() => void this.poll(), interval);
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          status: "PUBLISHED",
          publishedAt: { not: null },
          OR: [
            { publishedAt: { gt: this.cursorAt } },
            { publishedAt: this.cursorAt, id: { gt: this.cursorId } },
          ],
        },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
        take: this.config.get("WORKER_BATCH_SIZE", { infer: true }),
        select: {
          id: true,
          coupleId: true,
          aggregateId: true,
          eventType: true,
          payload: true,
          publishedAt: true,
        },
      });

      for (const event of events) {
        if (!event.publishedAt) continue;
        const payload = objectPayload(event.payload);
        const recipients = recipientIds(payload);
        if (event.coupleId) {
          this.gateway.publish(
            {
              coupleId: event.coupleId,
              ...(recipients ? { recipientIds: recipients } : {}),
            },
            {
              id: event.id,
              type: event.eventType,
              resourceId:
                optionalString(payload, "resourceId") ?? event.aggregateId,
              occurredAt: event.publishedAt.toISOString(),
            },
          );
        }
        this.cursorAt = event.publishedAt;
        this.cursorId = event.id;
      }
    } catch (error) {
      this.logger.error(
        "Realtime outbox relay failed",
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
