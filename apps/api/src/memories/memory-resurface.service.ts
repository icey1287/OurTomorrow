import { randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  MemoryResurfaceReason,
  MemoryStatus,
  Prisma,
  ReactionTargetType,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import { stateConflict } from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import {
  type MemoryCardRecord,
  type MemoryCardSummary,
  toMemoryCardSummary,
} from "./memory.presentation";
import { memoryCardSelect } from "./memories.service";

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

  async random(
    role: IdentityRole,
    excludeId?: string,
  ): Promise<MemoryCardSummary | null> {
    const actor = await this.identities.current(role);
    const memory = await this.serializable(async (transaction) => {
      const recent = await transaction.memoryResurface.findMany({
        where: {
          coupleId: actor.couple.id,
          reason: MemoryResurfaceReason.RANDOM,
        },
        orderBy: { displayedAt: "desc" },
        take: 8,
        select: { memoryId: true },
      });
      const recentIds = recent.map(({ memoryId }) => memoryId);
      const baseWhere: Prisma.MemoryWhereInput = {
        coupleId: actor.couple.id,
        status: MemoryStatus.PUBLISHED,
        deletedAt: null,
        happenedAt: { lte: this.clock.now() },
        ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
      };
      const freshWhere: Prisma.MemoryWhereInput = {
        ...baseWhere,
        ...(recentIds.length === 0
          ? {}
          : {
              id: {
                ...(excludeId === undefined ? {} : { not: excludeId }),
                notIn: recentIds,
              },
            }),
      };
      let selected = await this.pick(transaction, freshWhere);
      if (!selected) {
        selected = await this.pickLeastRecentlyShown(transaction, baseWhere);
      }
      if (!selected) return null;
      await transaction.memoryResurface.create({
        data: {
          coupleId: actor.couple.id,
          memoryId: selected.id,
          reason: MemoryResurfaceReason.RANDOM,
        },
      });
      return selected;
    });
    if (!memory) return null;
    const reactions = await this.prisma.reaction.findMany({
      where: {
        coupleId: actor.couple.id,
        targetType: ReactionTargetType.MEMORY,
        targetId: memory.id,
      },
      select: { authorId: true, emoji: true },
    });
    return toMemoryCardSummary(
      memory as MemoryCardRecord,
      actor.user.id,
      reactions,
    );
  }

  private async pick(
    transaction: Prisma.TransactionClient,
    where: Prisma.MemoryWhereInput,
  ): Promise<MemoryCardRecord | null> {
    const count = await transaction.memory.count({ where });
    if (count === 0) return null;
    return transaction.memory.findFirst({
      where,
      orderBy: { id: "asc" },
      skip: randomInt(count),
      select: memoryCardSelect,
    }) as Promise<MemoryCardRecord | null>;
  }

  private async pickLeastRecentlyShown(
    transaction: Prisma.TransactionClient,
    where: Prisma.MemoryWhereInput,
  ): Promise<MemoryCardRecord | null> {
    const candidates = await transaction.memory.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        ...memoryCardSelect,
        resurfaces: {
          where: { reason: MemoryResurfaceReason.RANDOM },
          orderBy: { displayedAt: "desc" },
          take: 1,
          select: { displayedAt: true },
        },
      },
    });
    if (candidates.length === 0) return null;
    candidates.sort((left, right) => {
      const leftTime = left.resurfaces[0]?.displayedAt.valueOf() ?? -Infinity;
      const rightTime = right.resurfaces[0]?.displayedAt.valueOf() ?? -Infinity;
      return leftTime - rightTime || left.id.localeCompare(right.id);
    });
    return candidates[0] as MemoryCardRecord;
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
        throw error;
      }
    }
    throw stateConflict();
  }
}
