import { Inject, Injectable } from "@nestjs/common";
import {
  AnnualReviewStatus,
  MediaKind,
  MediaStatus,
  MemoryStatus,
  PlaceHistoryState,
  Prisma,
  ScheduledEventType,
  WishStatus,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import { AuditService } from "../common/audit/audit.service";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { plainDateStartInstant } from "../common/time/calendar";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import {
  toMediaAssetSummary,
  type MediaAssetSummary,
} from "../memories/memory.presentation";
import {
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import type {
  PublishAnnualReviewDto,
  UpdateAnnualReviewDto,
} from "./dto/annual-review.dto";
import {
  annualReviewSelect,
  toAnnualReviewView,
  type AnnualReviewStatistics,
  type AnnualReviewView,
} from "./annual-review.presentation";

function startOfYear(year: number, timeZone: string): Date {
  return new Date(
    plainDateStartInstant(`${year}-01-01`, timeZone).epochMilliseconds,
  );
}

function validYear(year: number): boolean {
  return Number.isSafeInteger(year) && year >= 1900 && year <= 2200;
}

const annualMediaSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  status: true,
  createdAt: true,
  deletedAt: true,
});

function annualMediaWhere(
  coupleId: string,
  from: Date,
  until: Date,
  mediaId?: string,
): Prisma.MediaAssetWhereInput {
  const publishedMemory: Prisma.MemoryWhereInput = {
    coupleId,
    status: MemoryStatus.PUBLISHED,
    deletedAt: null,
    happenedAt: { gte: from, lt: until },
  };
  return {
    ...(mediaId ? { id: mediaId } : {}),
    coupleId,
    kind: MediaKind.IMAGE,
    status: MediaStatus.READY,
    deletedAt: null,
    OR: [
      { usedAsMemoryCover: { some: publishedMemory } },
      { memoryMedia: { some: { memory: publishedMemory } } },
    ],
  };
}

@Injectable()
export class AnnualReviewsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(AuditService)
    private readonly audit: AuditService,
  ) {}

  async list(role: IdentityRole): Promise<AnnualReviewView[]> {
    const actor = await this.identities.current(role);
    const reviews = await this.prisma.annualReview.findMany({
      where: { coupleId: actor.couple.id },
      orderBy: { year: "desc" },
      select: annualReviewSelect,
    });
    return reviews.map((review) =>
      toAnnualReviewView(review, actor.couple, actor.user.id),
    );
  }

  async get(role: IdentityRole, year: number): Promise<AnnualReviewView> {
    const actor = await this.identities.current(role);
    this.assertYear(actor.couple.startDate, actor.couple.timezone, year);
    const review = await this.prisma.annualReview.findUnique({
      where: { coupleId_year: { coupleId: actor.couple.id, year } },
      select: annualReviewSelect,
    });
    if (!review) throw resourceNotFound();
    return toAnnualReviewView(review, actor.couple, actor.user.id);
  }

  async mediaOptions(
    role: IdentityRole,
    year: number,
  ): Promise<MediaAssetSummary[]> {
    const actor = await this.identities.current(role);
    this.assertYear(actor.couple.startDate, actor.couple.timezone, year);
    const { from, until } = this.yearRange(
      actor.couple.startDate,
      actor.couple.timezone,
      year,
    );
    const media = await this.prisma.mediaAsset.findMany({
      where: annualMediaWhere(actor.couple.id, from, until),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: annualMediaSelect,
    });
    return media.map(toMediaAssetSummary);
  }

  async request(role: IdentityRole, year: number): Promise<AnnualReviewView> {
    const actor = await this.identities.current(role);
    this.assertYear(actor.couple.startDate, actor.couple.timezone, year);
    const now = this.clock.now();
    const review = await this.serializable(async (transaction) => {
      const existing = await transaction.annualReview.findUnique({
        where: { coupleId_year: { coupleId: actor.couple.id, year } },
        select: { id: true, status: true },
      });
      const reviewId = existing
        ? existing.id
        : (
            await transaction.annualReview.create({
              data: {
                coupleId: actor.couple.id,
                year,
                status: AnnualReviewStatus.GENERATING,
              },
              select: { id: true },
            })
          ).id;
      const published = existing?.status === AnnualReviewStatus.PUBLISHED;
      if (existing && !published) {
        await transaction.annualReview.update({
          where: { id: reviewId },
          data: { status: AnnualReviewStatus.GENERATING },
          select: { id: true },
        });
      }
      if (!existing || !published) {
        await upsertScheduledEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `annual-review:${reviewId}:generate`,
          type: ScheduledEventType.ANNUAL_REVIEW,
          payload: { annualReviewId: reviewId },
          runAt: now,
        });
      }
      const result = await transaction.annualReview.findUnique({
        where: { id: reviewId },
        select: annualReviewSelect,
      });
      if (!result) throw resourceNotFound();
      return result;
    });
    return toAnnualReviewView(review, actor.couple, actor.user.id);
  }

  async generate(
    coupleId: string,
    annualReviewId: string,
    now = this.clock.now(),
  ): Promise<void> {
    const review = await this.prisma.annualReview.findFirst({
      where: { id: annualReviewId, coupleId },
      select: {
        id: true,
        coupleId: true,
        year: true,
        status: true,
        couple: {
          select: {
            timezone: true,
            startDate: true,
            members: {
              where: { status: "ACTIVE" },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!review) return;
    if (review.status === AnnualReviewStatus.PUBLISHED) {
      return;
    }

    const { from, until } = this.yearRange(
      review.couple.startDate.toISOString().slice(0, 10),
      review.couple.timezone,
      review.year,
      now,
    );
    const [memories, completedWishes, visitedPlaces] = await Promise.all([
      this.prisma.memory.findMany({
        where: {
          coupleId: review.coupleId,
          status: MemoryStatus.PUBLISHED,
          deletedAt: null,
          happenedAt: { gte: from, lt: until },
        },
        orderBy: [{ happenedAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          placeId: true,
          coverMedia: {
            select: { id: true, status: true, deletedAt: true },
          },
          media: {
            where: {
              mediaAsset: {
                status: MediaStatus.READY,
                deletedAt: null,
              },
            },
            select: { mediaAssetId: true },
          },
          tags: { select: { tag: { select: { name: true } } } },
        },
      }),
      this.prisma.wish.count({
        where: {
          coupleId: review.coupleId,
          status: {
            in: [WishStatus.COMPLETED, WishStatus.CONVERTED_TO_MEMORY],
          },
          completedAt: { gte: from, lt: until },
          deletedAt: null,
        },
      }),
      this.prisma.place.findMany({
        where: {
          coupleId: review.coupleId,
          deletedAt: null,
          historyState: {
            in: [PlaceHistoryState.VISITED, PlaceHistoryState.LIVED],
          },
          firstVisitedAt: { gte: from, lt: until },
        },
        select: { id: true },
      }),
    ]);

    const places = new Set(visitedPlaces.map(({ id }) => id));
    const photos = new Set<string>();
    const keywords = new Map<string, number>();
    for (const memory of memories) {
      if (memory.placeId) places.add(memory.placeId);
      if (
        memory.coverMedia?.status === MediaStatus.READY &&
        memory.coverMedia.deletedAt === null
      ) {
        photos.add(memory.coverMedia.id);
      }
      for (const media of memory.media) photos.add(media.mediaAssetId);
      for (const { tag } of memory.tags) {
        keywords.set(tag.name, (keywords.get(tag.name) ?? 0) + 1);
      }
    }
    const statistics: AnnualReviewStatistics = {
      memories: memories.length,
      places: places.size,
      completedWishes,
      photos: photos.size,
    };
    const keywordList = [...keywords.entries()]
      .sort(
        ([leftName, leftCount], [rightName, rightCount]) =>
          rightCount - leftCount || leftName.localeCompare(rightName, "zh-CN"),
      )
      .slice(0, 8)
      .map(([name]) => name);

    await this.serializable(async (transaction) => {
      const changed = await transaction.annualReview.updateMany({
        where: {
          id: review.id,
          coupleId: review.coupleId,
          status: {
            in: [AnnualReviewStatus.DRAFT, AnnualReviewStatus.GENERATING],
          },
        },
        data: {
          status: AnnualReviewStatus.READY,
          statistics,
          keywords: keywordList,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) return;
      for (const member of review.couple.members) {
        await transaction.annualReviewContribution.upsert({
          where: {
            annualReviewId_authorId: {
              annualReviewId: review.id,
              authorId: member.userId,
            },
          },
          create: { annualReviewId: review.id, authorId: member.userId },
          update: {},
          select: { id: true },
        });
        await createPrivateNotification(transaction, {
          coupleId: review.coupleId,
          recipientId: member.userId,
          type: "ANNUAL_REVIEW_READY",
          dedupeKey: `annual-review:${review.id}:ready:${member.userId}`,
          resourceType: "ANNUAL_REVIEW",
          resourceId: review.id,
        });
        await enqueueOutboxEvent(transaction, {
          coupleId: review.coupleId,
          dedupeKey: `annual-review:${review.id}:ready:${member.userId}:outbox`,
          aggregateType: "ANNUAL_REVIEW",
          aggregateId: review.id,
          eventType: "annual-review.ready",
          recipientId: member.userId,
          occurredAt: now,
        });
      }
      await this.audit.record(
        {
          action: "ANNUAL_REVIEW_GENERATED",
          coupleId: review.coupleId,
          resourceType: "ANNUAL_REVIEW",
          resourceId: review.id,
          metadata: { status: AnnualReviewStatus.READY },
        },
        transaction,
      );
    });
  }

  async update(
    role: IdentityRole,
    year: number,
    dto: UpdateAnnualReviewDto,
  ): Promise<AnnualReviewView> {
    const actor = await this.identities.current(role);
    this.assertYear(actor.couple.startDate, actor.couple.timezone, year);
    if (
      dto.selectedMediaId === undefined &&
      dto.message === undefined &&
      dto.nextYearLetter === undefined
    ) {
      throw validationFailed("At least one annual review field is required");
    }
    const { from, until } = this.yearRange(
      actor.couple.startDate,
      actor.couple.timezone,
      year,
    );
    const review = await this.serializable(async (transaction) => {
      const existing = await transaction.annualReview.findUnique({
        where: { coupleId_year: { coupleId: actor.couple.id, year } },
        select: { id: true, status: true },
      });
      if (!existing) throw resourceNotFound();
      if (existing.status !== AnnualReviewStatus.READY) {
        throw validationFailed("Only a ready annual review can be edited");
      }
      if (dto.selectedMediaId) {
        const media = await transaction.mediaAsset.findFirst({
          where: annualMediaWhere(
            actor.couple.id,
            from,
            until,
            dto.selectedMediaId,
          ),
          select: { id: true },
        });
        if (!media) {
          throw validationFailed(
            "selectedMediaId must belong to a published memory in this review year",
          );
        }
      }
      const changed = await transaction.annualReview.updateMany({
        where: {
          id: existing.id,
          coupleId: actor.couple.id,
          version: dto.version,
          status: AnnualReviewStatus.READY,
        },
        data: {
          ...(dto.nextYearLetter === undefined
            ? {}
            : { nextYearLetter: dto.nextYearLetter || null }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      if (dto.selectedMediaId !== undefined || dto.message !== undefined) {
        await transaction.annualReviewContribution.upsert({
          where: {
            annualReviewId_authorId: {
              annualReviewId: existing.id,
              authorId: actor.user.id,
            },
          },
          create: {
            annualReviewId: existing.id,
            authorId: actor.user.id,
            selectedMediaId: dto.selectedMediaId ?? null,
            message: dto.message || null,
          },
          update: {
            ...(dto.selectedMediaId === undefined
              ? {}
              : { selectedMediaId: dto.selectedMediaId }),
            ...(dto.message === undefined
              ? {}
              : { message: dto.message || null }),
          },
          select: { id: true },
        });
      }
      await this.audit.record(
        {
          action: "ANNUAL_REVIEW_UPDATED",
          actorId: actor.user.id,
          coupleId: actor.couple.id,
          resourceType: "ANNUAL_REVIEW",
          resourceId: existing.id,
          metadata: { version: dto.version + 1 },
        },
        transaction,
      );
      const result = await transaction.annualReview.findUnique({
        where: { id: existing.id },
        select: annualReviewSelect,
      });
      if (!result) throw resourceNotFound();
      return result;
    });
    return toAnnualReviewView(review, actor.couple, actor.user.id);
  }

  async publish(
    role: IdentityRole,
    year: number,
    dto: PublishAnnualReviewDto,
  ): Promise<AnnualReviewView> {
    const actor = await this.identities.current(role);
    this.assertYear(actor.couple.startDate, actor.couple.timezone, year);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const review = await transaction.annualReview.findUnique({
        where: { coupleId_year: { coupleId: actor.couple.id, year } },
        select: { id: true },
      });
      if (!review) throw resourceNotFound();
      const changed = await transaction.annualReview.updateMany({
        where: {
          id: review.id,
          coupleId: actor.couple.id,
          version: dto.version,
          status: AnnualReviewStatus.READY,
        },
        data: {
          status: AnnualReviewStatus.PUBLISHED,
          publishedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await this.audit.record(
        {
          action: "ANNUAL_REVIEW_PUBLISHED",
          actorId: actor.user.id,
          coupleId: actor.couple.id,
          resourceType: "ANNUAL_REVIEW",
          resourceId: review.id,
          metadata: { status: AnnualReviewStatus.PUBLISHED },
        },
        transaction,
      );
    });
    return this.get(role, year);
  }

  private assertYear(startDate: string, timeZone: string, year: number): void {
    if (!validYear(year)) throw validationFailed("year is invalid");
    const firstYear = Number(startDate.slice(0, 4));
    const currentYear = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
      }).format(this.clock.now()),
    );
    if (year < firstYear || year > currentYear) {
      throw validationFailed("year must be within the relationship timeline");
    }
  }

  private yearRange(
    relationshipStartDate: string,
    timeZone: string,
    year: number,
    now = this.clock.now(),
  ): { from: Date; until: Date } {
    const yearStart = startOfYear(year, timeZone);
    const relationshipStart = new Date(
      plainDateStartInstant(relationshipStartDate, timeZone).epochMilliseconds,
    );
    const from = relationshipStart > yearStart ? relationshipStart : yearStart;
    const nextYear = startOfYear(year + 1, timeZone);
    return {
      from,
      until: nextYear < now ? nextYear : new Date(now.getTime() + 1),
    };
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
          ["P2002", "P2034"].includes(error.code)
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
