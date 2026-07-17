import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CapsuleStatus,
  MediaStatus,
  MemoryStatus,
  NoteStatus,
  PlanStatus,
  Prisma,
  RecycleBinItemStatus,
  RecycleBinResourceType,
  RecycleBinVisibility,
  WishStatus,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import { resolveStoragePath, stagingStorageKey } from "../media/media-storage";
import { upsertScheduledEvent } from "../shared-events/persistent-event";
import type { ListRecycleBinQueryDto } from "./dto/recycle-bin.dto";
import {
  cancelRecycleBinPurge,
  RECYCLE_BIN_PURGE_COOLING_OFF_MS,
  recycleBinPurgeEventKey,
} from "./recycle-bin.persistence";

const ACTIVE_ITEM_STATUSES = [
  RecycleBinItemStatus.AVAILABLE,
  RecycleBinItemStatus.PURGE_PENDING,
] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const recycleBinItemSelect = Prisma.validator<Prisma.RecycleBinItemSelect>()({
  id: true,
  coupleId: true,
  resourceType: true,
  resourceId: true,
  status: true,
  visibility: true,
  ownerId: true,
  deletedById: true,
  restoreData: true,
  deletedAt: true,
  retentionUntil: true,
  purgeRequestedAt: true,
  purgeAfter: true,
});

type RecycleBinItemRecord = Prisma.RecycleBinItemGetPayload<{
  select: typeof recycleBinItemSelect;
}>;

type RecycleCursor = {
  version: 1;
  filterHash: string;
  deletedAt: string;
  id: string;
};

export type RecycleBinItemView = {
  id: string;
  resourceType: RecycleBinResourceType;
  resourceId: string;
  status:
    | typeof RecycleBinItemStatus.AVAILABLE
    | typeof RecycleBinItemStatus.PURGE_PENDING;
  visibility: RecycleBinVisibility;
  deletedBy: IdentityResponse["user"];
  deletedAt: string;
  retentionUntil: string;
  purgeRequestedAt: string | null;
  purgeAfter: string | null;
  canRestore: true;
};

export type PaginatedRecycleBinItems = {
  items: RecycleBinItemView[];
  meta: { nextCursor: string | null; hasMore: boolean };
};

export type RecycleBinRestoreResult = {
  id: string;
  resourceType: RecycleBinResourceType;
  resourceId: string;
  restoredAt: string;
};

function objectValue(value: Prisma.JsonValue): Prisma.JsonObject {
  if (value !== null && !Array.isArray(value) && typeof value === "object") {
    return value as Prisma.JsonObject;
  }
  throw stateConflict({ invalidRestoreData: true });
}

function requiredString(data: Prisma.JsonObject, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.length === 0) {
    throw stateConflict({ invalidRestoreData: key });
  }
  return value;
}

function nullableString(data: Prisma.JsonObject, key: string): string | null {
  const value = data[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw stateConflict({ invalidRestoreData: key });
  }
  return value;
}

function nullableObject(
  data: Prisma.JsonObject,
  key: string,
): Prisma.JsonObject | null {
  const value = data[key];
  if (value === null || value === undefined) return null;
  return objectValue(value);
}

function nullableInstant(data: Prisma.JsonObject, key: string): Date | null {
  const value = nullableString(data, key);
  if (value === null) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf()) || instant.toISOString() !== value) {
    throw stateConflict({ invalidRestoreData: key });
  }
  return instant;
}

function enumValue<T extends string>(
  data: Prisma.JsonObject,
  key: string,
  values: readonly T[],
): T {
  const value = requiredString(data, key);
  if (!values.includes(value as T)) {
    throw stateConflict({ invalidRestoreData: key });
  }
  return value as T;
}

function filterHash(actor: IdentityResponse, type: string | undefined): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        coupleId: actor.couple.id,
        userId: actor.user.id,
        type: type ?? null,
      }),
    )
    .digest("hex");
}

function encodeCursor(
  item: Pick<RecycleBinItemRecord, "deletedAt" | "id">,
  hash: string,
): string {
  const cursor: RecycleCursor = {
    version: 1,
    filterHash: hash,
    deletedAt: item.deletedAt.toISOString(),
    id: item.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string, hash: string): RecycleCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RecycleCursor>;
    const deletedAt = new Date(parsed.deletedAt ?? "");
    if (
      parsed.version !== 1 ||
      parsed.filterHash !== hash ||
      typeof parsed.id !== "string" ||
      !UUID.test(parsed.id) ||
      Number.isNaN(deletedAt.valueOf()) ||
      deletedAt.toISOString() !== parsed.deletedAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as RecycleCursor;
  } catch {
    throw validationFailed(
      "cursor is invalid for the current recycle-bin filter",
    );
  }
}

@Injectable()
export class RecycleBinService {
  private readonly storageRoot: string;

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
    this.storageRoot = path.resolve(
      config.get("MEDIA_STORAGE_PATH", { infer: true }),
    );
  }

  async list(
    role: IdentityRole,
    query: ListRecycleBinQueryDto,
  ): Promise<PaginatedRecycleBinItems> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const hash = filterHash(actor, query.type);
    const cursor =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor, hash);
    const records = await this.prisma.recycleBinItem.findMany({
      where: {
        ...this.visibleWhere(actor),
        status: { in: [...ACTIVE_ITEM_STATUSES] },
        retentionUntil: { gt: now },
        ...(query.type === undefined
          ? {}
          : { resourceType: query.type as RecycleBinResourceType }),
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { deletedAt: { lt: new Date(cursor.deletedAt) } },
                {
                  deletedAt: new Date(cursor.deletedAt),
                  id: { lt: cursor.id },
                },
              ],
            }),
      },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: recycleBinItemSelect,
    });
    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;
    return {
      items: page.map((item) => this.present(actor, item)),
      meta: {
        hasMore,
        nextCursor:
          hasMore && page.length > 0
            ? encodeCursor(page[page.length - 1]!, hash)
            : null,
      },
    };
  }

  async restore(
    role: IdentityRole,
    itemId: string,
  ): Promise<RecycleBinRestoreResult> {
    const actor = await this.identities.current(role);
    const restoredAt = this.clock.now();
    const restored = await this.serializable(async (transaction) => {
      const item = await transaction.recycleBinItem.findFirst({
        where: {
          id: itemId,
          ...this.visibleWhere(actor),
          status: { in: [...ACTIVE_ITEM_STATUSES] },
        },
        select: recycleBinItemSelect,
      });
      if (!item) throw resourceNotFound();
      if (item.retentionUntil <= restoredAt) {
        throw stateConflict({ retentionExpired: true });
      }
      await this.restoreResource(transaction, actor, item, restoredAt);
      const changed = await transaction.recycleBinItem.updateMany({
        where: {
          id: item.id,
          coupleId: actor.couple.id,
          status: item.status,
        },
        data: {
          status: RecycleBinItemStatus.RESTORED,
          restoredAt,
          restoredById: actor.user.id,
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await cancelRecycleBinPurge(transaction, item.id);
      return item;
    });
    return {
      id: restored.id,
      resourceType: restored.resourceType,
      resourceId: restored.resourceId,
      restoredAt: restoredAt.toISOString(),
    };
  }

  async requestPurge(role: IdentityRole, itemId: string): Promise<void> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const item = await transaction.recycleBinItem.findFirst({
        where: {
          id: itemId,
          ...this.visibleWhere(actor),
          status: { in: [...ACTIVE_ITEM_STATUSES] },
        },
        select: recycleBinItemSelect,
      });
      if (!item) throw resourceNotFound();
      const purgeAfter = new Date(
        Math.min(
          item.retentionUntil.getTime(),
          now.getTime() + RECYCLE_BIN_PURGE_COOLING_OFF_MS,
        ),
      );
      const changed = await transaction.recycleBinItem.updateMany({
        where: {
          id: item.id,
          coupleId: actor.couple.id,
          status: item.status,
        },
        data: {
          status: RecycleBinItemStatus.PURGE_PENDING,
          purgeRequestedAt: item.purgeRequestedAt ?? now,
          purgeRequestedById: actor.user.id,
          purgeAfter,
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await upsertScheduledEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: recycleBinPurgeEventKey(item.id),
        type: "RECYCLE_BIN_PURGE",
        payload: { recycleBinItemId: item.id },
        runAt: purgeAfter > now ? purgeAfter : now,
        maxAttempts: 10,
      });
    });
  }

  /** Called by the durable scheduler after the retention deadline. */
  async purge(itemId: string, now = this.clock.now()): Promise<void> {
    const item = await this.preparePurge(itemId, now);
    if (!item) return;
    if (item.resourceType === RecycleBinResourceType.MEDIA) {
      const media = await this.prisma.mediaAsset.findFirst({
        where: {
          id: item.resourceId,
          coupleId: item.coupleId,
          deletedAt: { not: null },
          status: MediaStatus.DELETED,
        },
        select: { storageKey: true, thumbnailKey: true },
      });
      if (media) {
        await this.removeMediaFiles(item.resourceId, media);
      }
    }
    await this.serializable(async (transaction) => {
      const current = await transaction.recycleBinItem.findFirst({
        where: {
          id: item.id,
          coupleId: item.coupleId,
          status: RecycleBinItemStatus.PURGING,
        },
        select: recycleBinItemSelect,
      });
      if (!current) return;
      if (await this.resourceIsActive(transaction, current)) {
        await transaction.recycleBinItem.updateMany({
          where: {
            id: current.id,
            status: RecycleBinItemStatus.PURGING,
          },
          data: { status: RecycleBinItemStatus.RESTORED, restoredAt: now },
        });
        return;
      }
      await this.hardDeleteResource(transaction, current);
      const changed = await transaction.recycleBinItem.updateMany({
        where: {
          id: current.id,
          coupleId: current.coupleId,
          status: RecycleBinItemStatus.PURGING,
        },
        data: { status: RecycleBinItemStatus.PURGED, purgedAt: now },
      });
      if (changed.count !== 1) throw stateConflict();
    });
  }

  private visibleWhere(
    actor: IdentityResponse,
  ): Prisma.RecycleBinItemWhereInput {
    return {
      coupleId: actor.couple.id,
      AND: [
        {
          OR: [
            { visibility: RecycleBinVisibility.SHARED },
            {
              visibility: RecycleBinVisibility.OWNER_ONLY,
              ownerId: actor.user.id,
            },
          ],
        },
      ],
    };
  }

  private present(
    actor: IdentityResponse,
    item: RecycleBinItemRecord,
  ): RecycleBinItemView {
    const deletedBy = actor.couple.members.find(
      (member) => member.id === item.deletedById,
    );
    if (!deletedBy) throw new Error("Recycle-bin item references a non-member");
    if (
      item.status !== RecycleBinItemStatus.AVAILABLE &&
      item.status !== RecycleBinItemStatus.PURGE_PENDING
    ) {
      throw new Error("Non-recoverable recycle-bin item was selected");
    }
    return {
      id: item.id,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      status: item.status,
      visibility: item.visibility,
      deletedBy,
      deletedAt: item.deletedAt.toISOString(),
      retentionUntil: item.retentionUntil.toISOString(),
      purgeRequestedAt: item.purgeRequestedAt?.toISOString() ?? null,
      purgeAfter: item.purgeAfter?.toISOString() ?? null,
      canRestore: true,
    };
  }

  private async restoreResource(
    transaction: Prisma.TransactionClient,
    actor: IdentityResponse,
    item: RecycleBinItemRecord,
    now: Date,
  ): Promise<void> {
    const data = objectValue(item.restoreData);
    switch (item.resourceType) {
      case RecycleBinResourceType.MEMORY:
        await this.restoreMemory(transaction, actor, item, data);
        return;
      case RecycleBinResourceType.NOTE:
        await this.restoreNote(transaction, item, data, now);
        return;
      case RecycleBinResourceType.WISH:
        await this.restoreWish(transaction, item, data, now);
        return;
      case RecycleBinResourceType.PLAN:
        await this.restorePlan(transaction, item, data, now);
        return;
      case RecycleBinResourceType.ANNIVERSARY:
        await this.restoreAnniversary(transaction, item, data, now);
        return;
      case RecycleBinResourceType.CAPSULE:
        await this.restoreCapsule(transaction, item, data);
        return;
      case RecycleBinResourceType.PLACE:
        await this.restoreSimple(transaction.place, item);
        return;
      case RecycleBinResourceType.TAG:
        await this.restoreSimple(transaction.tag, item);
        return;
      case RecycleBinResourceType.MEDIA:
        await this.restoreMedia(transaction, item, data);
        return;
    }
  }

  private async restoreMemory(
    transaction: Prisma.TransactionClient,
    actor: IdentityResponse,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
  ): Promise<void> {
    const status = enumValue(data, "status", Object.values(MemoryStatus));
    const changed = await transaction.memory.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: {
        status,
        deletedAt: null,
        updatedById: actor.user.id,
        version: { increment: 1 },
      },
    });
    await this.assertRestored(transaction.memory, item, changed.count);
  }

  private async restoreNote(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
    now: Date,
  ): Promise<void> {
    const status = enumValue(data, "status", Object.values(NoteStatus));
    const showAt = nullableInstant(data, "showAt");
    const expiresAt = nullableInstant(data, "expiresAt");
    const changed = await transaction.note.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: {
        status,
        archivedAt: nullableInstant(data, "archivedAt"),
        visibleAt: nullableInstant(data, "visibleAt"),
        viewedAt: nullableInstant(data, "viewedAt"),
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    await this.assertRestored(transaction.note, item, changed.count);
    if (status === NoteStatus.SCHEDULED && showAt !== null) {
      await upsertScheduledEvent(transaction, {
        coupleId: item.coupleId,
        dedupeKey: `note:${item.resourceId}:show`,
        type: "NOTE_SHOW",
        payload: { noteId: item.resourceId },
        runAt: showAt > now ? showAt : now,
      });
    }
    if (
      expiresAt !== null &&
      (status === NoteStatus.SCHEDULED ||
        status === NoteStatus.VISIBLE ||
        status === NoteStatus.VIEWED)
    ) {
      await upsertScheduledEvent(transaction, {
        coupleId: item.coupleId,
        dedupeKey: `note:${item.resourceId}:expire`,
        type: "NOTE_EXPIRE",
        payload: { noteId: item.resourceId },
        runAt: expiresAt > now ? expiresAt : now,
      });
    }
  }

  private async restoreWish(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
    now: Date,
  ): Promise<void> {
    const status = enumValue(data, "status", Object.values(WishStatus));
    const changed = await transaction.wish.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: { status, deletedAt: null, version: { increment: 1 } },
    });
    await this.assertRestored(transaction.wish, item, changed.count);
    const planData = nullableObject(data, "plan");
    if (planData === null) return;
    const planId = requiredString(planData, "id");
    const planStatus = enumValue(planData, "status", Object.values(PlanStatus));
    const restoredPlan = await transaction.plan.updateMany({
      where: {
        id: planId,
        coupleId: item.coupleId,
        wishId: item.resourceId,
        deletedAt: { not: null },
      },
      data: {
        status: planStatus,
        completedAt: nullableInstant(planData, "completedAt"),
        cancelledAt: nullableInstant(planData, "cancelledAt"),
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    if (restoredPlan.count === 0) {
      const active = await transaction.plan.findFirst({
        where: {
          id: planId,
          coupleId: item.coupleId,
          wishId: item.resourceId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!active) throw stateConflict({ linkedPlanUnavailable: true });
    }
    await this.schedulePlanReminder(transaction, item.coupleId, planId, now);
  }

  private async restorePlan(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
    now: Date,
  ): Promise<void> {
    const status = enumValue(data, "status", Object.values(PlanStatus));
    const wishId = nullableString(data, "wishId");
    if (wishId !== null) {
      const wish = await transaction.wish.findFirst({
        where: { id: wishId, coupleId: item.coupleId, deletedAt: null },
        select: { id: true },
      });
      if (!wish) throw stateConflict({ linkedWishUnavailable: true });
      const otherPlan = await transaction.plan.findFirst({
        where: {
          id: { not: item.resourceId },
          coupleId: item.coupleId,
          wishId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (otherPlan) throw stateConflict({ linkedWishAlreadyPlanned: true });
    }
    const changed = await transaction.plan.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: {
        status,
        wishId,
        completedAt: nullableInstant(data, "completedAt"),
        cancelledAt: nullableInstant(data, "cancelledAt"),
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    await this.assertRestored(transaction.plan, item, changed.count);
    const linkedWish = nullableObject(data, "linkedWish");
    if (linkedWish !== null && wishId !== null) {
      if (requiredString(linkedWish, "id") !== wishId) {
        throw stateConflict({ invalidRestoreData: "linkedWish.id" });
      }
      const desiredStatus = enumValue(
        linkedWish,
        "status",
        Object.values(WishStatus),
      );
      const current = await transaction.wish.findFirst({
        where: { id: wishId, coupleId: item.coupleId, deletedAt: null },
        select: { status: true },
      });
      if (!current) throw stateConflict({ linkedWishUnavailable: true });
      if (
        current.status !== WishStatus.IDEA &&
        current.status !== desiredStatus
      ) {
        throw stateConflict({ currentWishStatus: current.status });
      }
      if (current.status !== desiredStatus) {
        const restoredWish = await transaction.wish.updateMany({
          where: {
            id: wishId,
            coupleId: item.coupleId,
            deletedAt: null,
            status: current.status,
          },
          data: {
            status: desiredStatus,
            plannedFor: nullableInstant(linkedWish, "plannedFor"),
            completedAt: nullableInstant(linkedWish, "completedAt"),
            completedById: nullableString(linkedWish, "completedById"),
            version: { increment: 1 },
          },
        });
        if (restoredWish.count !== 1) throw stateConflict();
      }
    }
    await this.schedulePlanReminder(
      transaction,
      item.coupleId,
      item.resourceId,
      now,
    );
  }

  private async restoreAnniversary(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
    now: Date,
  ): Promise<void> {
    const changed = await transaction.anniversary.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await this.assertRestored(transaction.anniversary, item, changed.count);
    const events = data.scheduledEvents;
    if (events === undefined || events === null) return;
    if (!Array.isArray(events)) {
      throw stateConflict({ invalidRestoreData: "scheduledEvents" });
    }
    for (const value of events) {
      const event = objectValue(value);
      const dedupeKey = requiredString(event, "dedupeKey");
      const runAt = nullableInstant(event, "runAt");
      const payload = objectValue(event.payload ?? null);
      const maxAttempts = event.maxAttempts;
      if (
        runAt === null ||
        typeof maxAttempts !== "number" ||
        !Number.isSafeInteger(maxAttempts) ||
        maxAttempts < 1
      ) {
        throw stateConflict({ invalidRestoreData: "scheduledEvents" });
      }
      await upsertScheduledEvent(transaction, {
        coupleId: item.coupleId,
        dedupeKey,
        type: "ANNIVERSARY_REMINDER",
        payload: payload as Prisma.InputJsonObject,
        runAt: runAt > now ? runAt : now,
        maxAttempts,
      });
    }
  }

  private async restoreCapsule(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
  ): Promise<void> {
    const status = enumValue(data, "status", Object.values(CapsuleStatus));
    if (status !== CapsuleStatus.DRAFT) {
      throw stateConflict({ invalidRestoreData: "status" });
    }
    const changed = await transaction.capsule.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        status: CapsuleStatus.DRAFT,
        deletedAt: { not: null },
      },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await this.assertRestored(transaction.capsule, item, changed.count);
  }

  private async restoreMedia(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
    data: Prisma.JsonObject,
  ): Promise<void> {
    const status = enumValue(data, "status", [
      MediaStatus.PENDING,
      MediaStatus.READY,
      MediaStatus.QUARANTINED,
    ]);
    const changed = await transaction.mediaAsset.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        status: MediaStatus.DELETED,
        deletedAt: { not: null },
      },
      data: { status, deletedAt: null },
    });
    await this.assertRestored(transaction.mediaAsset, item, changed.count);
  }

  private async restoreSimple(
    delegate: {
      updateMany(args: unknown): Promise<{ count: number }>;
      findFirst(args: unknown): Promise<{ id: string } | null>;
    },
    item: RecycleBinItemRecord,
  ): Promise<void> {
    const changed = await delegate.updateMany({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: { not: null },
      },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await this.assertRestored(delegate, item, changed.count);
  }

  private async assertRestored(
    delegate: {
      findFirst(args: unknown): Promise<{ id: string } | null>;
    },
    item: RecycleBinItemRecord,
    count: number,
  ): Promise<void> {
    if (count === 1) return;
    const active = await delegate.findFirst({
      where: {
        id: item.resourceId,
        coupleId: item.coupleId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!active) throw resourceNotFound();
  }

  private async schedulePlanReminder(
    transaction: Prisma.TransactionClient,
    coupleId: string,
    planId: string,
    now: Date,
  ): Promise<void> {
    const plan = await transaction.plan.findFirst({
      where: { id: planId, coupleId, deletedAt: null },
      select: { status: true, version: true, reminderAt: true },
    });
    if (
      plan?.status === PlanStatus.SCHEDULED &&
      plan.reminderAt !== null &&
      plan.reminderAt > now
    ) {
      await upsertScheduledEvent(transaction, {
        coupleId,
        dedupeKey: `plan:${planId}:reminder`,
        type: "PLAN_REMINDER",
        payload: { planId, expectedVersion: plan.version },
        runAt: plan.reminderAt,
      });
    }
  }

  private async preparePurge(
    itemId: string,
    now: Date,
  ): Promise<RecycleBinItemRecord | null> {
    return this.serializable(async (transaction) => {
      const item = await transaction.recycleBinItem.findFirst({
        where: {
          id: itemId,
          status: {
            in: [
              RecycleBinItemStatus.AVAILABLE,
              RecycleBinItemStatus.PURGE_PENDING,
              RecycleBinItemStatus.PURGING,
            ],
          },
        },
        select: recycleBinItemSelect,
      });
      if (!item) return null;
      const purgeAfter = item.purgeAfter ?? item.retentionUntil;
      if (purgeAfter > now) {
        throw new Error("RECYCLE_BIN_PURGE was claimed before purgeAfter");
      }
      if (item.status === RecycleBinItemStatus.PURGING) return item;
      const changed = await transaction.recycleBinItem.updateMany({
        where: { id: item.id, status: item.status },
        data: { status: RecycleBinItemStatus.PURGING },
      });
      if (changed.count !== 1) throw stateConflict();
      return item;
    });
  }

  private async resourceIsActive(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
  ): Promise<boolean> {
    const where = {
      id: item.resourceId,
      coupleId: item.coupleId,
      deletedAt: null,
    };
    switch (item.resourceType) {
      case RecycleBinResourceType.MEMORY:
        return (await transaction.memory.count({ where })) > 0;
      case RecycleBinResourceType.NOTE:
        return (await transaction.note.count({ where })) > 0;
      case RecycleBinResourceType.WISH:
        return (await transaction.wish.count({ where })) > 0;
      case RecycleBinResourceType.PLAN:
        return (await transaction.plan.count({ where })) > 0;
      case RecycleBinResourceType.ANNIVERSARY:
        return (await transaction.anniversary.count({ where })) > 0;
      case RecycleBinResourceType.CAPSULE:
        return (await transaction.capsule.count({ where })) > 0;
      case RecycleBinResourceType.PLACE:
        return (await transaction.place.count({ where })) > 0;
      case RecycleBinResourceType.TAG:
        return (await transaction.tag.count({ where })) > 0;
      case RecycleBinResourceType.MEDIA:
        return (await transaction.mediaAsset.count({ where })) > 0;
    }
  }

  private async hardDeleteResource(
    transaction: Prisma.TransactionClient,
    item: RecycleBinItemRecord,
  ): Promise<void> {
    const where = {
      id: item.resourceId,
      coupleId: item.coupleId,
      deletedAt: { not: null },
    };
    switch (item.resourceType) {
      case RecycleBinResourceType.MEMORY:
        await transaction.memory.deleteMany({ where });
        return;
      case RecycleBinResourceType.NOTE:
        await transaction.note.deleteMany({ where });
        return;
      case RecycleBinResourceType.WISH:
        await transaction.plan.deleteMany({
          where: {
            coupleId: item.coupleId,
            wishId: item.resourceId,
            deletedAt: { not: null },
          },
        });
        await transaction.wish.deleteMany({ where });
        return;
      case RecycleBinResourceType.PLAN:
        await transaction.plan.deleteMany({ where });
        return;
      case RecycleBinResourceType.ANNIVERSARY:
        await transaction.anniversary.deleteMany({ where });
        return;
      case RecycleBinResourceType.CAPSULE:
        await transaction.capsule.deleteMany({ where });
        return;
      case RecycleBinResourceType.PLACE:
        await transaction.place.deleteMany({ where });
        return;
      case RecycleBinResourceType.TAG:
        await transaction.tag.deleteMany({ where });
        return;
      case RecycleBinResourceType.MEDIA:
        await transaction.mediaAsset.deleteMany({
          where: { ...where, status: MediaStatus.DELETED },
        });
        return;
    }
  }

  private async removeMediaFiles(
    mediaId: string,
    media: { storageKey: string; thumbnailKey: string | null },
  ): Promise<void> {
    const targets = [
      resolveStoragePath(this.storageRoot, media.storageKey),
      ...(media.thumbnailKey === null
        ? []
        : [resolveStoragePath(this.storageRoot, media.thumbnailKey)]),
      resolveStoragePath(this.storageRoot, stagingStorageKey(mediaId)),
      resolveStoragePath(this.storageRoot, `quarantine/${mediaId}`),
    ];
    await Promise.all(
      targets.map((target) =>
        fileSystem.rm(target, { recursive: true, force: true }),
      ),
    );
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
          error.code === "P2034" &&
          attempt < 3
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034")
        ) {
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
