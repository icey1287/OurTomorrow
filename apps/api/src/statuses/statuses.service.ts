import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { CurrentStatusKind, CurrentStatusState, Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  ApiException,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import type { PutCurrentStatusDto } from "./dto/status.dto";
import {
  currentStatusSelect,
  toCurrentStatusView,
  type CurrentStatusesResponse,
  type CurrentStatusView,
} from "./status.presentation";

const STATUS_EXPIRE_KEY = (statusId: string): string =>
  `current-status:${statusId}:expire`;

function preconditionRequired(message: string): ApiException {
  return new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "PRECONDITION_REQUIRED",
    message,
  );
}

function parseExpiry(value: string, now: Date): Date {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw validationFailed(
      "expiresAt must include Z or an explicit UTC offset",
    );
  }
  const expiry = new Date(value);
  if (Number.isNaN(expiry.valueOf())) {
    throw validationFailed("expiresAt must be a valid ISO 8601 instant");
  }
  if (expiry <= now) {
    throw validationFailed("expiresAt must be later than serverNow");
  }
  return expiry;
}

@Injectable()
export class StatusesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async current(role: IdentityRole): Promise<CurrentStatusesResponse> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const memberIds = actor.couple.members.map((member) => member.id);
    const statuses = await this.prisma.currentStatus.findMany({
      where: {
        coupleId: actor.couple.id,
        authorId: { in: memberIds },
        state: CurrentStatusState.ACTIVE,
        expiresAt: { gt: now },
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      select: currentStatusSelect,
    });
    const mine = statuses.find((status) => status.authorId === actor.user.id);
    const partner = statuses.find(
      (status) => status.authorId !== actor.user.id,
    );

    return {
      serverNow: now.toISOString(),
      mine: mine ? toCurrentStatusView(mine, actor.couple) : null,
      partner: partner ? toCurrentStatusView(partner, actor.couple) : null,
    };
  }

  async putMine(
    role: IdentityRole,
    dto: PutCurrentStatusDto,
  ): Promise<CurrentStatusView> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const expiresAt = parseExpiry(dto.expiresAt, now);
    if (
      dto.kind === CurrentStatusKind.CUSTOM &&
      (!dto.message || dto.message.trim().length === 0)
    ) {
      throw validationFailed("message is required for a CUSTOM status");
    }
    const statusId = randomUUID();

    const status = await this.serializable(async (transaction) => {
      const active = await transaction.currentStatus.findMany({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          state: CurrentStatusState.ACTIVE,
        },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        select: { id: true, version: true, expiresAt: true },
      });
      const current = active.find((candidate) => candidate.expiresAt > now);
      if (current && dto.version === undefined) {
        throw preconditionRequired(
          "version is required when replacing the current status",
        );
      }
      if (
        (current && dto.version !== current.version) ||
        (!current && dto.version !== undefined)
      ) {
        throw stateConflict(
          current ? { currentVersion: current.version } : undefined,
        );
      }

      if (current) {
        const changed = await transaction.currentStatus.updateMany({
          where: {
            id: current.id,
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            state: CurrentStatusState.ACTIVE,
            version: current.version,
          },
          data: {
            state: CurrentStatusState.ARCHIVED,
            archivedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw stateConflict();
      }

      const otherActiveIds = active
        .filter((candidate) => candidate.id !== current?.id)
        .map((candidate) => candidate.id);
      if (otherActiveIds.length > 0) {
        await transaction.currentStatus.updateMany({
          where: {
            id: { in: otherActiveIds },
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            state: CurrentStatusState.ACTIVE,
          },
          data: {
            state: CurrentStatusState.ARCHIVED,
            archivedAt: now,
            version: { increment: 1 },
          },
        });
      }
      for (const previous of active) {
        await cancelScheduledEvent(transaction, STATUS_EXPIRE_KEY(previous.id));
      }

      const created = await transaction.currentStatus.create({
        data: {
          id: statusId,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          kind: dto.kind,
          message: dto.message === "" ? null : (dto.message ?? null),
          mood: dto.mood === "" ? null : (dto.mood ?? null),
          scene: dto.scene === "" ? null : (dto.scene ?? null),
          needsResponse: dto.needsResponse ?? false,
          startsAt: now,
          expiresAt,
        },
        select: currentStatusSelect,
      });

      await upsertScheduledEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: STATUS_EXPIRE_KEY(statusId),
        type: "STATUS_EXPIRE",
        payload: { statusId, expectedVersion: created.version },
        runAt: expiresAt,
      });
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: partner.id,
        type: dto.needsResponse
          ? "STATUS_RESPONSE_REQUESTED"
          : "STATUS_UPDATED",
        dedupeKey: `current-status:${statusId}:v${created.version}:notification`,
        resourceType: "CURRENT_STATUS",
        resourceId: statusId,
        title: dto.needsResponse
          ? "对方希望得到你的回应"
          : "对方更新了此刻状态",
        body: "去看看对方此刻正在经历什么。",
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `current-status:${statusId}:v${created.version}:updated`,
        aggregateType: "CURRENT_STATUS",
        aggregateId: statusId,
        eventType: "current_status.updated",
        actorId: actor.user.id,
        recipientId: partner.id,
        version: created.version,
        occurredAt: now,
      });
      return created;
    });

    return toCurrentStatusView(status, actor.couple);
  }

  async removeMine(role: IdentityRole, version: number): Promise<void> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();

    await this.serializable(async (transaction) => {
      const current = await transaction.currentStatus.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          state: CurrentStatusState.ACTIVE,
          expiresAt: { gt: now },
        },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        select: { id: true, version: true },
      });
      if (!current) throw resourceNotFound();
      if (current.version !== version) {
        throw stateConflict({ currentVersion: current.version });
      }

      const changed = await transaction.currentStatus.updateMany({
        where: {
          id: current.id,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          state: CurrentStatusState.ACTIVE,
          expiresAt: { gt: now },
          version,
        },
        data: {
          state: CurrentStatusState.ARCHIVED,
          archivedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();

      await cancelScheduledEvent(transaction, STATUS_EXPIRE_KEY(current.id));
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `current-status:${current.id}:v${version + 1}:archived`,
        aggregateType: "CURRENT_STATUS",
        aggregateId: current.id,
        eventType: "current_status.archived",
        actorId: actor.user.id,
        recipientId: partner.id,
        version: version + 1,
        occurredAt: now,
      });
    });
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
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
