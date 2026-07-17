import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  PlanStatus,
  Prisma,
  WishStatus,
  type ScheduledEventStatus,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import { scheduleWishCompletionCapsules } from "../capsules/capsules.service";
import {
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
import { readableMediaAssetWhere } from "../media/media-access";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import type {
  CompleteWishDto,
  CreateWishDto,
  CreateWishUpdateDto,
  ListWishesQueryDto,
  ReopenWishDto,
  UpdateWishDto,
  WishPlanDto,
} from "./dto/wish.dto";
import {
  toWishDetail,
  toWishSummary,
  toWishUpdateView,
  wishDetailSelect,
  wishSummarySelect,
  type WishDetail,
  type WishSummary,
  type WishUpdateRecord,
  type WishUpdateView,
} from "./wish.presentation";

const PLAN_REMINDER_KEY = (planId: string): string => `plan:${planId}:reminder`;
const REMINDER_CANCELLABLE_STATUSES = [
  "PENDING",
  "RETRYING",
  "RUNNING",
] satisfies ScheduledEventStatus[];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WishCursor = {
  version: 1;
  filterHash: string;
  updatedAt: string;
  id: string;
};

type WishActionRecord = {
  id: string;
  version: number;
  status: WishStatus;
  title: string;
  expectation: string | null;
  placeId: string | null;
  plan: {
    id: string;
    version: number;
    status: PlanStatus;
    reminderAt: Date | null;
    deletedAt: Date | null;
  } | null;
};

type WishDatabase = Pick<
  Prisma.TransactionClient,
  | "mediaAsset"
  | "notification"
  | "outboxEvent"
  | "place"
  | "plan"
  | "scheduledEvent"
  | "wish"
  | "wishMedia"
  | "wishUpdate"
>;

export type PaginatedWishes = {
  items: WishSummary[];
  meta: { nextCursor: string | null; hasMore: boolean };
};

function normalizeNullable(value: string | null): string | null;
function normalizeNullable(value: undefined): undefined;
function normalizeNullable(
  value: string | null | undefined,
): string | null | undefined;
function normalizeNullable(
  value: string | null | undefined,
): string | null | undefined {
  return value === "" ? null : value;
}

function parseOptionalInstant(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw validationFailed(`${field} must include Z or an explicit UTC offset`);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    throw validationFailed(`${field} must be a valid ISO 8601 instant`);
  }
  return instant;
}

function filterHash(
  actor: IdentityResponse,
  query: ListWishesQueryDto,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        coupleId: actor.couple.id,
        status: query.status ?? null,
        category: query.category ?? null,
        placeId: query.placeId ?? null,
        query: query.query ?? null,
      }),
    )
    .digest("base64url")
    .slice(0, 24);
}

function encodeCursor(
  wish: { updatedAt: Date; id: string },
  expectedFilterHash: string,
): string {
  const cursor: WishCursor = {
    version: 1,
    filterHash: expectedFilterHash,
    updatedAt: wish.updatedAt.toISOString(),
    id: wish.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string, expectedFilterHash: string): WishCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<WishCursor>;
    const updatedAt = new Date(parsed.updatedAt ?? "");
    if (
      parsed.version !== 1 ||
      parsed.filterHash !== expectedFilterHash ||
      typeof parsed.id !== "string" ||
      !UUID.test(parsed.id) ||
      Number.isNaN(updatedAt.valueOf()) ||
      updatedAt.toISOString() !== parsed.updatedAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as WishCursor;
  } catch {
    throw validationFailed("cursor is invalid or expired");
  }
}

@Injectable()
export class WishesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async list(
    role: IdentityRole,
    query: ListWishesQueryDto,
  ): Promise<PaginatedWishes> {
    const actor = await this.identities.current(role);
    const currentFilterHash = filterHash(actor, query);
    const cursor = query.cursor
      ? decodeCursor(query.cursor, currentFilterHash)
      : null;
    const where: Prisma.WishWhereInput = {
      coupleId: actor.couple.id,
      deletedAt: null,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.placeId === undefined ? {} : { placeId: query.placeId }),
      ...(query.query === undefined
        ? {}
        : {
            OR: [
              { title: { contains: query.query, mode: "insensitive" } },
              {
                description: {
                  contains: query.query,
                  mode: "insensitive",
                },
              },
              {
                expectation: {
                  contains: query.query,
                  mode: "insensitive",
                },
              },
            ],
          }),
      ...(cursor === null
        ? {}
        : {
            AND: [
              {
                OR: [
                  { updatedAt: { lt: new Date(cursor.updatedAt) } },
                  {
                    updatedAt: new Date(cursor.updatedAt),
                    id: { lt: cursor.id },
                  },
                ],
              },
            ],
          }),
    };
    const records = await this.prisma.wish.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: wishSummarySelect,
    });
    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;
    const last = page.at(-1);
    return {
      items: page.map((wish) => toWishSummary(wish, actor.couple)),
      meta: {
        hasMore,
        nextCursor:
          hasMore && last ? encodeCursor(last, currentFilterHash) : null,
      },
    };
  }

  async get(role: IdentityRole, wishId: string): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    return this.detailForActor(actor, wishId);
  }

  async create(role: IdentityRole, dto: CreateWishDto): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const wishId = await this.serializable(async (transaction) => {
      await this.assertPlace(transaction, actor.couple.id, dto.placeId);
      const wish = await transaction.wish.create({
        data: {
          coupleId: actor.couple.id,
          createdById: actor.user.id,
          title: dto.title,
          description: normalizeNullable(dto.description) ?? null,
          expectation: normalizeNullable(dto.expectation) ?? null,
          category: dto.category ?? "CUSTOM",
          placeId: dto.placeId ?? null,
        },
        select: { id: true, version: true },
      });
      await transaction.wishUpdate.create({
        data: {
          wishId: wish.id,
          authorId: actor.user.id,
          fromStatus: null,
          toStatus: WishStatus.IDEA,
        },
        select: { id: true },
      });
      await this.publishMutation(transaction, actor, partner.id, {
        wishId: wish.id,
        version: wish.version,
        eventType: "wish.created",
        notificationType: "WISH_CREATED",
        dedupeSuffix: "created",
        now,
      });
      return wish.id;
    });
    return this.detailForActor(actor, wishId);
  }

  async update(
    role: IdentityRole,
    wishId: string,
    dto: UpdateWishDto,
  ): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    if (Object.keys(dto).every((field) => field === "version")) {
      throw validationFailed("At least one wish field must be updated");
    }
    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersion(current, dto.version);
      if (current.status === WishStatus.CONVERTED_TO_MEMORY) {
        throw stateConflict({ currentStatus: current.status });
      }
      await this.assertPlace(transaction, actor.couple.id, dto.placeId);
      const data: Prisma.WishUncheckedUpdateManyInput = {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.description === undefined
          ? {}
          : { description: normalizeNullable(dto.description) }),
        ...(dto.expectation === undefined
          ? {}
          : { expectation: normalizeNullable(dto.expectation) }),
        ...(dto.category === undefined ? {} : { category: dto.category }),
        ...(dto.placeId === undefined ? {} : { placeId: dto.placeId }),
        version: { increment: 1 },
      };
      const changed = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: { not: WishStatus.CONVERTED_TO_MEMORY },
        },
        data,
      });
      if (changed.count !== 1) throw stateConflict();
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: dto.version + 1,
        eventType: "wish.updated",
        notificationType: "WISH_UPDATED",
        dedupeSuffix: "updated",
        now,
      });
    });
    return this.detailForActor(actor, wishId);
  }

  async remove(
    role: IdentityRole,
    wishId: string,
    version: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersion(current, version);
      const changed = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version,
        },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stateConflict();
      if (current.plan !== null && current.plan.deletedAt === null) {
        const planChanged = await transaction.plan.updateMany({
          where: {
            id: current.plan.id,
            coupleId: actor.couple.id,
            deletedAt: null,
            version: current.plan.version,
          },
          data: {
            deletedAt: now,
            ...(current.plan.status === PlanStatus.COMPLETED ||
            current.plan.status === PlanStatus.CANCELLED
              ? {}
              : { status: PlanStatus.CANCELLED, cancelledAt: now }),
            version: { increment: 1 },
          },
        });
        if (planChanged.count !== 1) throw stateConflict();
        await cancelScheduledEvent(
          transaction,
          PLAN_REMINDER_KEY(current.plan.id),
          REMINDER_CANCELLABLE_STATUSES,
        );
      }
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: version + 1,
        eventType: "wish.deleted",
        notificationType: "WISH_DELETED",
        dedupeSuffix: "deleted",
        now,
      });
    });
  }

  async plan(
    role: IdentityRole,
    wishId: string,
    dto: WishPlanDto,
  ): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersionAndStatus(current, dto.version, WishStatus.IDEA);
      if (current.plan !== null && current.plan.deletedAt === null) {
        throw stateConflict({ currentStatus: current.status });
      }

      const startsAt = parseOptionalInstant(dto.startsAt, "startsAt") ?? null;
      const endsAt = parseOptionalInstant(dto.endsAt, "endsAt") ?? null;
      const reminderAt =
        parseOptionalInstant(dto.reminderAt, "reminderAt") ?? null;
      this.validatePlanTiming(startsAt, endsAt, reminderAt, now);
      const placeId = dto.placeId === undefined ? current.placeId : dto.placeId;
      await this.assertPlace(transaction, actor.couple.id, placeId);

      const plan = await transaction.plan.create({
        data: {
          coupleId: actor.couple.id,
          wishId,
          createdById: actor.user.id,
          title: dto.title ?? current.title,
          itinerary: normalizeNullable(dto.itinerary) ?? null,
          preparations: dto.preparations ?? [],
          participants: dto.participants ?? [],
          expectation:
            dto.expectation === undefined
              ? current.expectation
              : (normalizeNullable(dto.expectation) ?? null),
          placeId: placeId ?? null,
          startsAt,
          endsAt,
          reminderAt,
          status: startsAt === null ? PlanStatus.DRAFT : PlanStatus.SCHEDULED,
        },
        select: { id: true, version: true },
      });
      const changed = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: WishStatus.IDEA,
        },
        data: {
          status: WishStatus.PLANNED,
          plannedFor: startsAt,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await transaction.wishUpdate.create({
        data: {
          wishId,
          authorId: actor.user.id,
          fromStatus: WishStatus.IDEA,
          toStatus: WishStatus.PLANNED,
        },
        select: { id: true },
      });
      if (reminderAt !== null) {
        await upsertScheduledEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: PLAN_REMINDER_KEY(plan.id),
          type: "PLAN_REMINDER",
          payload: { planId: plan.id, expectedVersion: plan.version },
          runAt: reminderAt,
        });
      }
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: dto.version + 1,
        eventType: "wish.planned",
        notificationType: "WISH_PLANNED",
        dedupeSuffix: "planned",
        now,
      });
    });
    return this.detailForActor(actor, wishId);
  }

  async start(
    role: IdentityRole,
    wishId: string,
    version: number,
  ): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersionAndStatus(current, version, WishStatus.PLANNED);
      const plan = this.activePlan(current);
      if (
        plan.status !== PlanStatus.DRAFT &&
        plan.status !== PlanStatus.SCHEDULED
      ) {
        throw stateConflict({ currentPlanStatus: plan.status });
      }
      const planChanged = await transaction.plan.updateMany({
        where: {
          id: plan.id,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: plan.version,
          status: { in: [PlanStatus.DRAFT, PlanStatus.SCHEDULED] },
        },
        data: {
          status: PlanStatus.IN_PROGRESS,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (planChanged.count !== 1) throw stateConflict();
      const wishChanged = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version,
          status: WishStatus.PLANNED,
        },
        data: {
          status: WishStatus.IN_PROGRESS,
          version: { increment: 1 },
        },
      });
      if (wishChanged.count !== 1) throw stateConflict();
      await cancelScheduledEvent(
        transaction,
        PLAN_REMINDER_KEY(plan.id),
        REMINDER_CANCELLABLE_STATUSES,
      );
      await transaction.wishUpdate.create({
        data: {
          wishId,
          authorId: actor.user.id,
          fromStatus: WishStatus.PLANNED,
          toStatus: WishStatus.IN_PROGRESS,
        },
        select: { id: true },
      });
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: version + 1,
        eventType: "wish.started",
        notificationType: "WISH_STARTED",
        dedupeSuffix: "started",
        now,
      });
    });
    return this.detailForActor(actor, wishId);
  }

  async complete(
    role: IdentityRole,
    wishId: string,
    dto: CompleteWishDto,
  ): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const completedAt =
      parseOptionalInstant(dto.completedAt, "completedAt") ?? now;
    if (completedAt > now) {
      throw validationFailed("completedAt cannot be in the future");
    }
    const mediaIds = dto.mediaIds;
    if (mediaIds && new Set(mediaIds).size !== mediaIds.length) {
      throw validationFailed("mediaIds must not contain duplicates");
    }

    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersionAndStatus(current, dto.version, WishStatus.IN_PROGRESS);
      const plan = this.activePlan(current);
      if (plan.status !== PlanStatus.IN_PROGRESS) {
        throw stateConflict({ currentPlanStatus: plan.status });
      }
      if (mediaIds !== undefined) {
        await this.assertMedia(
          transaction,
          actor.couple.id,
          actor.user.id,
          mediaIds,
        );
      }

      const planChanged = await transaction.plan.updateMany({
        where: {
          id: plan.id,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: plan.version,
          status: PlanStatus.IN_PROGRESS,
        },
        data: {
          status: PlanStatus.COMPLETED,
          completedAt,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (planChanged.count !== 1) throw stateConflict();
      const wishChanged = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: WishStatus.IN_PROGRESS,
        },
        data: {
          status: WishStatus.COMPLETED,
          completedAt,
          completionNote: normalizeNullable(dto.completionNote) ?? null,
          completedById: actor.user.id,
          version: { increment: 1 },
        },
      });
      if (wishChanged.count !== 1) throw stateConflict();
      if (mediaIds !== undefined) {
        await transaction.wishMedia.deleteMany({ where: { wishId } });
        if (mediaIds.length > 0) {
          await transaction.wishMedia.createMany({
            data: mediaIds.map((mediaAssetId, sortOrder) => ({
              wishId,
              mediaAssetId,
              sortOrder,
            })),
          });
        }
      }
      await cancelScheduledEvent(
        transaction,
        PLAN_REMINDER_KEY(plan.id),
        REMINDER_CANCELLABLE_STATUSES,
      );
      await scheduleWishCompletionCapsules(transaction, {
        coupleId: actor.couple.id,
        wishId,
        completedAt,
      });
      await transaction.wishUpdate.create({
        data: {
          wishId,
          authorId: actor.user.id,
          fromStatus: WishStatus.IN_PROGRESS,
          toStatus: WishStatus.COMPLETED,
          note: normalizeNullable(dto.completionNote) ?? null,
        },
        select: { id: true },
      });
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: dto.version + 1,
        eventType: "wish.completed",
        notificationType: "WISH_COMPLETED",
        dedupeSuffix: "completed",
        now,
      });
    });
    return this.detailForActor(actor, wishId);
  }

  async reopen(
    role: IdentityRole,
    wishId: string,
    dto: ReopenWishDto,
  ): Promise<WishDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findActionWish(
        transaction,
        actor.couple.id,
        wishId,
      );
      this.assertVersionAndStatus(current, dto.version, WishStatus.COMPLETED);
      const plan = this.activePlan(current);
      if (plan.status !== PlanStatus.COMPLETED) {
        throw stateConflict({ currentPlanStatus: plan.status });
      }
      const planChanged = await transaction.plan.updateMany({
        where: {
          id: plan.id,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: plan.version,
          status: PlanStatus.COMPLETED,
        },
        data: {
          status: PlanStatus.IN_PROGRESS,
          completedAt: null,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (planChanged.count !== 1) throw stateConflict();
      const wishChanged = await transaction.wish.updateMany({
        where: {
          id: wishId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version: dto.version,
          status: WishStatus.COMPLETED,
        },
        data: {
          status: WishStatus.IN_PROGRESS,
          completedAt: null,
          completionNote: null,
          completedById: null,
          version: { increment: 1 },
        },
      });
      if (wishChanged.count !== 1) throw stateConflict();
      await cancelScheduledEvent(
        transaction,
        PLAN_REMINDER_KEY(plan.id),
        REMINDER_CANCELLABLE_STATUSES,
      );
      await transaction.wishUpdate.create({
        data: {
          wishId,
          authorId: actor.user.id,
          fromStatus: WishStatus.COMPLETED,
          toStatus: WishStatus.IN_PROGRESS,
          note: normalizeNullable(dto.note) ?? null,
        },
        select: { id: true },
      });
      await this.publishMutation(transaction, actor, partner.id, {
        wishId,
        version: dto.version + 1,
        eventType: "wish.reopened",
        notificationType: "WISH_REOPENED",
        dedupeSuffix: "reopened",
        now,
      });
    });
    return this.detailForActor(actor, wishId);
  }

  async addUpdate(
    role: IdentityRole,
    wishId: string,
    dto: CreateWishUpdateDto,
  ): Promise<WishUpdateView> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const update = await this.serializable(async (transaction) => {
      const wish = await transaction.wish.findFirst({
        where: { id: wishId, coupleId: actor.couple.id, deletedAt: null },
        select: { id: true, version: true },
      });
      if (!wish) throw resourceNotFound();
      const created = await transaction.wishUpdate.create({
        data: {
          wishId,
          authorId: actor.user.id,
          note: dto.note,
        },
        select: {
          id: true,
          authorId: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
        },
      });
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: partner.id,
        type: "WISH_UPDATE_ADDED",
        dedupeKey: `wish-update:${created.id}:notification`,
        resourceType: "WISH",
        resourceId: wishId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `wish-update:${created.id}:created`,
        aggregateType: "WISH",
        aggregateId: wishId,
        eventType: "wish.update_added",
        actorId: actor.user.id,
        recipientId: partner.id,
        version: wish.version,
        occurredAt: now,
      });
      return created;
    });
    return toWishUpdateView(update as WishUpdateRecord, actor.couple);
  }

  private async detailForActor(
    actor: IdentityResponse,
    wishId: string,
  ): Promise<WishDetail> {
    const wish = await this.prisma.wish.findFirst({
      where: { id: wishId, coupleId: actor.couple.id, deletedAt: null },
      select: wishDetailSelect,
    });
    if (!wish) throw resourceNotFound();
    return toWishDetail(wish, actor.couple);
  }

  private async findActionWish(
    database: WishDatabase,
    coupleId: string,
    wishId: string,
  ): Promise<WishActionRecord> {
    const wish = await database.wish.findFirst({
      where: { id: wishId, coupleId, deletedAt: null },
      select: {
        id: true,
        version: true,
        status: true,
        title: true,
        expectation: true,
        placeId: true,
        plan: {
          select: {
            id: true,
            version: true,
            status: true,
            reminderAt: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!wish) throw resourceNotFound();
    return wish;
  }

  private assertVersion(current: WishActionRecord, version: number): void {
    if (current.version !== version) {
      throw stateConflict({
        currentVersion: current.version,
        currentStatus: current.status,
      });
    }
  }

  private assertVersionAndStatus(
    current: WishActionRecord,
    version: number,
    status: WishStatus,
  ): void {
    this.assertVersion(current, version);
    if (current.status !== status) {
      throw stateConflict({ currentStatus: current.status });
    }
  }

  private activePlan(
    current: WishActionRecord,
  ): NonNullable<WishActionRecord["plan"]> {
    if (current.plan === null || current.plan.deletedAt !== null) {
      throw stateConflict({ currentStatus: current.status });
    }
    return current.plan;
  }

  private validatePlanTiming(
    startsAt: Date | null,
    endsAt: Date | null,
    reminderAt: Date | null,
    now: Date,
  ): void {
    if (startsAt !== null && startsAt <= now) {
      throw validationFailed("startsAt must be in the future");
    }
    if (endsAt !== null && startsAt === null) {
      throw validationFailed("startsAt is required when endsAt is set");
    }
    if (endsAt !== null && startsAt !== null && endsAt <= startsAt) {
      throw validationFailed("endsAt must be later than startsAt");
    }
    if (reminderAt !== null && startsAt === null) {
      throw validationFailed("startsAt is required when reminderAt is set");
    }
    if (reminderAt !== null && startsAt !== null && reminderAt >= startsAt) {
      throw validationFailed("reminderAt must be earlier than startsAt");
    }
    if (reminderAt !== null && reminderAt <= now) {
      throw validationFailed("reminderAt must be in the future");
    }
  }

  private async assertPlace(
    database: WishDatabase,
    coupleId: string,
    placeId: string | null | undefined,
  ): Promise<void> {
    if (placeId === null || placeId === undefined) return;
    const place = await database.place.findFirst({
      where: { id: placeId, coupleId, deletedAt: null },
      select: { id: true },
    });
    if (!place) throw resourceNotFound();
  }

  private async assertMedia(
    database: WishDatabase,
    coupleId: string,
    userId: string,
    mediaIds: string[],
  ): Promise<void> {
    if (mediaIds.length === 0) return;
    const count = await database.mediaAsset.count({
      where: {
        id: { in: mediaIds },
        ...readableMediaAssetWhere(coupleId, userId),
      },
    });
    if (count !== mediaIds.length) throw resourceNotFound();
  }

  private partner(actor: IdentityResponse) {
    const partner = actor.couple.members.find(
      (member) => member.id !== actor.user.id,
    );
    if (!partner) throw resourceNotFound();
    return partner;
  }

  private async publishMutation(
    database: WishDatabase,
    actor: IdentityResponse,
    recipientId: string,
    input: {
      wishId: string;
      version: number;
      eventType: string;
      notificationType: string;
      dedupeSuffix: string;
      now: Date;
    },
  ): Promise<void> {
    const key = `wish:${input.wishId}:v${input.version}:${input.dedupeSuffix}`;
    await createPrivateNotification(database, {
      coupleId: actor.couple.id,
      recipientId,
      type: input.notificationType,
      dedupeKey: `${key}:notification`,
      resourceType: "WISH",
      resourceId: input.wishId,
    });
    await enqueueOutboxEvent(database, {
      coupleId: actor.couple.id,
      dedupeKey: key,
      aggregateType: "WISH",
      aggregateId: input.wishId,
      eventType: input.eventType,
      actorId: actor.user.id,
      recipientId,
      version: input.version,
      occurredAt: input.now,
    });
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
