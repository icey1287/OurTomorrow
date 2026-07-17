import { Inject, Injectable } from "@nestjs/common";
import {
  MediaStatus,
  MemoryResurfaceReason,
  MemoryStatus,
  Prisma,
  ReactionTargetType,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import { resourceNotFound, stateConflict } from "../common/http/api-exception";
import {
  instantToPlainDate,
  plainDateStartInstant,
} from "../common/time/calendar";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import {
  type MemoryCardRecord,
  type MemoryCardSummary,
  toMemoryCardSummary,
} from "./memory.presentation";
import { memoryCardSelect } from "./memories.service";

const RECENT_MEMORY_COUNT = 8;
const MAX_SERIALIZABLE_ATTEMPTS = 5;

const resurfaceSelect = Prisma.validator<Prisma.MemoryResurfaceSelect>()({
  id: true,
  coupleId: true,
  memoryId: true,
  localDate: true,
  reason: true,
  displayedAt: true,
  openedAt: true,
  dismissedAt: true,
  memory: {
    select: {
      ...memoryCardSelect,
      deletedAt: true,
    },
  },
});

type ResurfaceRecord = Prisma.MemoryResurfaceGetPayload<{
  select: typeof resurfaceSelect;
}>;

type CandidateRecord = MemoryCardRecord & {
  deletedAt: Date | null;
  resurfaces: Array<{ displayedAt: Date }>;
};

export type MemoryResurfaceView = {
  id: string;
  localDate: string;
  reason: MemoryResurfaceReason;
  openedAt: string | null;
  dismissedAt: string | null;
  memory: MemoryCardSummary | null;
};

export type MemoryResurfaceTodayResponse = {
  serverNow: string;
  localDate: string;
  box: MemoryResurfaceView | null;
};

type SelectedCandidate = {
  memory: CandidateRecord;
  reason: MemoryResurfaceReason;
};

function storedLocalDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

function serializedLocalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function season(month: number): number {
  if (month === 12 || month <= 2) return 0;
  if (month <= 5) return 1;
  if (month <= 8) return 2;
  return 3;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

@Injectable()
export class MemoryResurfaceService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async today(role: IdentityRole): Promise<MemoryResurfaceTodayResponse> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const localDate = instantToPlainDate(now, actor.couple.timezone).toString();
    const box = await this.ensureTodaySlot(
      actor,
      now,
      localDate,
      storedLocalDate(localDate),
    );
    await this.scheduleNext(actor.couple.id, actor.couple.timezone, localDate);

    return {
      serverNow: now.toISOString(),
      localDate,
      box: box ? await this.toView(actor, box, now) : null,
    };
  }

  async materializeScheduled(coupleId: string, at: Date): Promise<void> {
    const actor = await this.identities.current("boy");
    if (actor.couple.id !== coupleId) return;
    const localDate = instantToPlainDate(at, actor.couple.timezone).toString();
    await this.ensureTodaySlot(
      actor,
      at,
      localDate,
      storedLocalDate(localDate),
    );
    await this.scheduleNext(actor.couple.id, actor.couple.timezone, localDate);
  }

  async open(
    role: IdentityRole,
    resurfaceId: string,
  ): Promise<MemoryResurfaceView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const localDate = storedLocalDate(
      instantToPlainDate(now, actor.couple.timezone).toString(),
    );
    const box = await this.serializable(async (transaction) => {
      const existing = await transaction.memoryResurface.findFirst({
        where: {
          id: resurfaceId,
          coupleId: actor.couple.id,
          localDate,
        },
        select: resurfaceSelect,
      });
      if (!existing) throw resourceNotFound();
      if (existing.dismissedAt) {
        throw stateConflict({ state: "DISMISSED" });
      }
      if (existing.openedAt) return existing;

      const changed = await transaction.memoryResurface.updateMany({
        where: {
          id: resurfaceId,
          coupleId: actor.couple.id,
          localDate,
          openedAt: null,
          dismissedAt: null,
        },
        data: { openedAt: now },
      });
      if (changed.count === 0) {
        const current = await transaction.memoryResurface.findFirst({
          where: {
            id: resurfaceId,
            coupleId: actor.couple.id,
            localDate,
          },
          select: resurfaceSelect,
        });
        if (!current) throw resourceNotFound();
        if (current.dismissedAt) {
          throw stateConflict({ state: "DISMISSED" });
        }
        return current;
      }

      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `memory-resurface:${resurfaceId}:opened`,
        aggregateType: "MEMORY_RESURFACE",
        aggregateId: resurfaceId,
        eventType: "memory_resurface.opened",
        actorId: actor.user.id,
        recipientIds: actor.couple.members.map((member) => member.id),
        occurredAt: now,
      });

      return transaction.memoryResurface.findUniqueOrThrow({
        where: { id: resurfaceId },
        select: resurfaceSelect,
      });
    });

    return this.toView(actor, box, now);
  }

  async dismiss(
    role: IdentityRole,
    resurfaceId: string,
  ): Promise<MemoryResurfaceView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const localDate = storedLocalDate(
      instantToPlainDate(now, actor.couple.timezone).toString(),
    );
    const box = await this.serializable(async (transaction) => {
      const existing = await transaction.memoryResurface.findFirst({
        where: {
          id: resurfaceId,
          coupleId: actor.couple.id,
          localDate,
        },
        select: resurfaceSelect,
      });
      if (!existing) throw resourceNotFound();
      if (existing.dismissedAt) return existing;

      const changed = await transaction.memoryResurface.updateMany({
        where: {
          id: resurfaceId,
          coupleId: actor.couple.id,
          localDate,
          dismissedAt: null,
        },
        data: { dismissedAt: now },
      });
      if (changed.count === 0) {
        return transaction.memoryResurface.findUniqueOrThrow({
          where: { id: resurfaceId },
          select: resurfaceSelect,
        });
      }
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `memory-resurface:${resurfaceId}:dismissed`,
        aggregateType: "MEMORY_RESURFACE",
        aggregateId: resurfaceId,
        eventType: "memory_resurface.dismissed",
        actorId: actor.user.id,
        recipientIds: actor.couple.members.map((member) => member.id),
        occurredAt: now,
      });
      return transaction.memoryResurface.findUniqueOrThrow({
        where: { id: resurfaceId },
        select: resurfaceSelect,
      });
    });

    return this.toView(actor, box, now);
  }

  /**
   * Stage-two compatibility endpoint. It may reuse an already-opened daily
   * box, but never creates a resurface record or reveals an unopened box.
   */
  async random(
    role: IdentityRole,
    excludeId?: string,
  ): Promise<MemoryCardSummary | null> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const localDate = storedLocalDate(
      instantToPlainDate(now, actor.couple.timezone).toString(),
    );
    const existing = await this.prisma.memoryResurface.findUnique({
      where: {
        coupleId_localDate: {
          coupleId: actor.couple.id,
          localDate,
        },
      },
      select: resurfaceSelect,
    });
    if (
      existing?.openedAt &&
      !existing.dismissedAt &&
      existing.memory.id !== excludeId &&
      this.isReadableMemory(existing.memory, now)
    ) {
      return this.presentMemory(actor, existing.memory);
    }

    const excludedIds = [excludeId, existing?.memoryId].filter(
      (value): value is string => Boolean(value),
    );
    const selected = await this.prisma.$transaction((transaction) =>
      this.pickCandidate(
        transaction,
        actor,
        now,
        instantToPlainDate(now, actor.couple.timezone).toString(),
        excludedIds,
      ),
    );
    return selected ? this.presentMemory(actor, selected.memory) : null;
  }

  private async ensureTodaySlot(
    actor: IdentityResponse,
    now: Date,
    localDateText: string,
    localDate: Date,
  ): Promise<ResurfaceRecord | null> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const existing = await transaction.memoryResurface.findUnique({
              where: {
                coupleId_localDate: {
                  coupleId: actor.couple.id,
                  localDate,
                },
              },
              select: resurfaceSelect,
            });
            if (existing) return existing;

            const selected = await this.pickCandidate(
              transaction,
              actor,
              now,
              localDateText,
              [],
            );
            if (!selected) return null;

            return transaction.memoryResurface.create({
              data: {
                coupleId: actor.couple.id,
                memoryId: selected.memory.id,
                localDate,
                reason: selected.reason,
              },
              select: resurfaceSelect,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryableTransactionError(error)) throw error;

        const concurrent = await this.prisma.memoryResurface.findUnique({
          where: {
            coupleId_localDate: {
              coupleId: actor.couple.id,
              localDate,
            },
          },
          select: resurfaceSelect,
        });
        if (concurrent) return concurrent;
        if (attempt === MAX_SERIALIZABLE_ATTEMPTS) throw stateConflict();
      }
    }
    throw stateConflict();
  }

  private async pickCandidate(
    transaction: Prisma.TransactionClient,
    actor: IdentityResponse,
    now: Date,
    localDateText: string,
    excludedIds: readonly string[],
  ): Promise<SelectedCandidate | null> {
    const baseWhere: Prisma.MemoryWhereInput = {
      coupleId: actor.couple.id,
      status: MemoryStatus.PUBLISHED,
      deletedAt: null,
      happenedAt: { lte: now },
      ...(excludedIds.length === 0 ? {} : { id: { notIn: [...excludedIds] } }),
    };
    const candidates = (await transaction.memory.findMany({
      where: baseWhere,
      orderBy: { id: "asc" },
      select: {
        ...memoryCardSelect,
        deletedAt: true,
        resurfaces: {
          orderBy: { displayedAt: "desc" },
          take: 1,
          select: { displayedAt: true },
        },
      },
    })) as CandidateRecord[];
    if (candidates.length === 0) return null;

    const firstUploaded = await transaction.memory.findFirst({
      where: {
        ...baseWhere,
        OR: [
          {
            coverMedia: {
              is: { status: MediaStatus.READY, deletedAt: null },
            },
          },
          {
            media: {
              some: {
                mediaAsset: {
                  status: MediaStatus.READY,
                  deletedAt: null,
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const recent = await transaction.memoryResurface.findMany({
      where: { coupleId: actor.couple.id },
      orderBy: [{ displayedAt: "desc" }, { id: "desc" }],
      take: RECENT_MEMORY_COUNT,
      select: { memoryId: true },
    });
    const recentIds = new Set(recent.map(({ memoryId }) => memoryId));
    const localDate = instantToPlainDate(`${localDateText}T12:00:00Z`, "UTC");

    const classified = candidates.map((memory) => ({
      memory,
      reason: this.reasonFor(
        memory,
        firstUploaded?.id ?? null,
        localDate.year,
        localDate.month,
        localDate.day,
        actor.couple.timezone,
      ),
    }));
    const tiers = [
      MemoryResurfaceReason.ON_THIS_DAY,
      MemoryResurfaceReason.FIRST_UPLOAD,
      MemoryResurfaceReason.PLACE,
      MemoryResurfaceReason.SEASON,
      MemoryResurfaceReason.COMPLETE_PERSPECTIVES,
      MemoryResurfaceReason.RANDOM,
    ].map((reason) =>
      classified.filter((candidate) => candidate.reason === reason),
    );

    for (const tier of tiers) {
      const fresh = tier.filter(({ memory }) => !recentIds.has(memory.id));
      if (fresh.length > 0) return this.leastRecentlyShown(fresh);
    }
    for (const tier of tiers) {
      if (tier.length > 0) return this.leastRecentlyShown(tier);
    }
    return null;
  }

  private reasonFor(
    memory: CandidateRecord,
    firstUploadedId: string | null,
    currentYear: number,
    currentMonth: number,
    currentDay: number,
    timezone: string,
  ): MemoryResurfaceReason {
    const happened = instantToPlainDate(memory.happenedAt, timezone);
    if (
      happened.year < currentYear &&
      happened.month === currentMonth &&
      happened.day === currentDay
    ) {
      return MemoryResurfaceReason.ON_THIS_DAY;
    }
    if (memory.id === firstUploadedId) {
      return MemoryResurfaceReason.FIRST_UPLOAD;
    }
    if (memory.place) return MemoryResurfaceReason.PLACE;
    if (season(happened.month) === season(currentMonth)) {
      return MemoryResurfaceReason.SEASON;
    }
    if (
      memory.perspectives.filter(({ submittedAt }) => submittedAt !== null)
        .length >= 2
    ) {
      return MemoryResurfaceReason.COMPLETE_PERSPECTIVES;
    }
    return MemoryResurfaceReason.RANDOM;
  }

  private leastRecentlyShown(
    candidates: SelectedCandidate[],
  ): SelectedCandidate {
    return [...candidates].sort((left, right) => {
      const leftTime =
        left.memory.resurfaces[0]?.displayedAt.valueOf() ?? -Infinity;
      const rightTime =
        right.memory.resurfaces[0]?.displayedAt.valueOf() ?? -Infinity;
      return (
        leftTime - rightTime || left.memory.id.localeCompare(right.memory.id)
      );
    })[0]!;
  }

  private async toView(
    actor: IdentityResponse,
    record: ResurfaceRecord,
    now: Date,
  ): Promise<MemoryResurfaceView> {
    const memory =
      record.openedAt &&
      !record.dismissedAt &&
      this.isReadableMemory(record.memory, now)
        ? await this.presentMemory(actor, record.memory)
        : null;
    return {
      id: record.id,
      localDate: serializedLocalDate(record.localDate),
      reason: record.reason,
      openedAt: record.openedAt?.toISOString() ?? null,
      dismissedAt: record.dismissedAt?.toISOString() ?? null,
      memory,
    };
  }

  private isReadableMemory(
    memory: ResurfaceRecord["memory"],
    now: Date,
  ): boolean {
    return (
      memory.status === MemoryStatus.PUBLISHED &&
      memory.deletedAt === null &&
      memory.happenedAt <= now
    );
  }

  private async presentMemory(
    actor: IdentityResponse,
    memory: MemoryCardRecord,
  ): Promise<MemoryCardSummary> {
    const reactions = await this.prisma.reaction.findMany({
      where: {
        coupleId: actor.couple.id,
        targetType: ReactionTargetType.MEMORY,
        targetId: memory.id,
      },
      select: { authorId: true, emoji: true },
    });
    return toMemoryCardSummary(memory, actor.user.id, reactions);
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !isRetryableTransactionError(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          if (isRetryableTransactionError(error)) throw stateConflict();
          throw error;
        }
      }
    }
    throw stateConflict();
  }

  private async scheduleNext(
    coupleId: string,
    timeZone: string,
    localDateText: string,
  ): Promise<void> {
    const nextDate = instantToPlainDate(
      `${localDateText}T12:00:00Z`,
      "UTC",
    ).add({ days: 1 });
    const runAt = new Date(
      plainDateStartInstant(nextDate, timeZone).add({ minutes: 5 })
        .epochMilliseconds,
    );
    await upsertScheduledEvent(this.prisma, {
      coupleId,
      dedupeKey: `memory-resurface:${coupleId}:${nextDate.toString()}`,
      type: "MEMORY_RESURFACE",
      payload: {},
      runAt,
    });
  }
}
