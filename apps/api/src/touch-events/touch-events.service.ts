import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import { ApiException, resourceNotFound } from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  createPrivateNotification,
  enqueueOutboxEvent,
} from "../shared-events/persistent-event";
import type { CreateTouchEventDto } from "./dto/touch-event.dto";
import {
  toTouchEventView,
  touchEventSelect,
  type TouchEventView,
} from "./touch-event.presentation";

export const TOUCH_COOLDOWN_MS = 30_000;
export const TOUCH_HOURLY_LIMIT = 12;
const TOUCH_RATE_WINDOW_MS = 60 * 60 * 1_000;
const SERIALIZABLE_ATTEMPTS = 5;

function rateLimited(
  retryAt: Date,
  now: Date,
  reason: "COOLDOWN" | "HOURLY_LIMIT",
) {
  return new ApiException(
    HttpStatus.TOO_MANY_REQUESTS,
    "RATE_LIMITED",
    "Touch signals are intentionally limited",
    {
      reason,
      retryAt: retryAt.toISOString(),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((retryAt.getTime() - now.getTime()) / 1_000),
      ),
    },
  );
}

@Injectable()
export class TouchEventsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async create(
    role: IdentityRole,
    dto: CreateTouchEventDto,
  ): Promise<TouchEventView> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const eventId = randomUUID();

    const event = await this.serializable(async (transaction) => {
      const cooldownStartedAt = new Date(now.getTime() - TOUCH_COOLDOWN_MS);
      const latest = await transaction.touchEvent.findFirst({
        where: {
          coupleId: actor.couple.id,
          senderId: actor.user.id,
          createdAt: { gt: cooldownStartedAt },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      });
      if (latest) {
        throw rateLimited(
          new Date(latest.createdAt.getTime() + TOUCH_COOLDOWN_MS),
          now,
          "COOLDOWN",
        );
      }

      const windowStartedAt = new Date(now.getTime() - TOUCH_RATE_WINDOW_MS);
      const sentInWindow = await transaction.touchEvent.count({
        where: {
          coupleId: actor.couple.id,
          senderId: actor.user.id,
          createdAt: { gt: windowStartedAt },
        },
      });
      if (sentInWindow >= TOUCH_HOURLY_LIMIT) {
        const oldest = await transaction.touchEvent.findFirst({
          where: {
            coupleId: actor.couple.id,
            senderId: actor.user.id,
            createdAt: { gt: windowStartedAt },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { createdAt: true },
        });
        throw rateLimited(
          new Date((oldest?.createdAt ?? now).getTime() + TOUCH_RATE_WINDOW_MS),
          now,
          "HOURLY_LIMIT",
        );
      }

      const created = await transaction.touchEvent.create({
        data: {
          id: eventId,
          coupleId: actor.couple.id,
          senderId: actor.user.id,
          recipientId: partner.id,
          kind: dto.kind,
          deliveredAt: now,
          createdAt: now,
        },
        select: touchEventSelect,
      });
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: partner.id,
        type: "TOUCH_EVENT_RECEIVED",
        dedupeKey: `touch-event:${eventId}:notification`,
        resourceType: "TOUCH_EVENT",
        resourceId: eventId,
        payload: { kind: dto.kind },
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `touch-event:${eventId}:received`,
        aggregateType: "TOUCH_EVENT",
        aggregateId: eventId,
        eventType: `touch.${dto.kind}`,
        actorId: actor.user.id,
        recipientId: partner.id,
        occurredAt: now,
      });
      return created;
    });

    return toTouchEventView(event, actor.user.id);
  }

  private partner(actor: IdentityResponse) {
    const partner = actor.couple.members.find(
      (member) => member.id !== actor.user.id,
    );
    if (!partner) throw resourceNotFound();
    return partner;
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < SERIALIZABLE_ATTEMPTS
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          const failedAt = this.clock.now();
          throw rateLimited(
            new Date(failedAt.getTime() + TOUCH_COOLDOWN_MS),
            failedAt,
            "COOLDOWN",
          );
        }
        throw error;
      }
    }
    const failedAt = this.clock.now();
    throw rateLimited(
      new Date(failedAt.getTime() + TOUCH_COOLDOWN_MS),
      failedAt,
      "COOLDOWN",
    );
  }
}
