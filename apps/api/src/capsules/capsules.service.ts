import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CapsuleStatus,
  CapsuleType,
  CapsuleUnlockRule,
  Prisma,
  RecycleBinResourceType,
  RecycleBinVisibility,
  type AnniversaryLeapDayRule,
  type AnniversaryRepeat,
  type WishStatus,
} from "@prisma/client";
import { AuditService } from "../common/audit/audit.service";
import { Clock } from "../common/clock/clock";
import {
  actionForbidden,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import {
  instantToPlainDate,
  nextAnniversaryOccurrence,
  plainDateStartInstant,
} from "../common/time/calendar";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import { readableMediaAssetWhere } from "../media/media-access";
import { createRecycleBinItem } from "../recycle-bin/recycle-bin.persistence";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import {
  canOpenCapsuleType,
  capsuleContentSelect,
  capsuleDerivedDueAt,
  capsuleMetadataSelect,
  isCapsuleVisibleTo,
  shouldLoadCapsuleBody,
  toCapsuleDetail,
  toCapsuleSummary,
  type CapsuleDetail,
  type CapsuleMetadataRecord,
  type CapsuleSummary,
} from "./capsule.presentation";
import type { CreateCapsuleDto, UpdateCapsuleDto } from "./dto/capsule.dto";

type CapsuleDatabase = Pick<
  Prisma.TransactionClient,
  | "anniversary"
  | "auditLog"
  | "capsule"
  | "capsuleMedia"
  | "capsuleMessage"
  | "capsuleOpenRecord"
  | "coupleMember"
  | "mediaAsset"
  | "notification"
  | "outboxEvent"
  | "recycleBinItem"
  | "scheduledEvent"
  | "wish"
>;

type CapsuleConfiguration = {
  type: CapsuleType;
  unlockRule: CapsuleUnlockRule;
  unlockAt: Date | null;
  anniversaryId: string | null;
  wishId: string | null;
  unlockCondition: string | null;
  requiresBothConfirmation: boolean;
};

type AnniversaryRuleRecord = {
  date: Date;
  repeat: AnniversaryRepeat;
  leapDayRule: AnniversaryLeapDayRule;
};

type WishRuleRecord = {
  status: WishStatus;
  completedAt: Date | null;
};

type RuleReferences = {
  anniversary: AnniversaryRuleRecord | null;
  wish: WishRuleRecord | null;
};

type EventCapsule = Pick<
  CapsuleMetadataRecord,
  "id" | "coupleId" | "type" | "createdById"
>;

const CAPSULE_STATUS_LOCKED: readonly CapsuleStatus[] = [
  CapsuleStatus.SEALED,
  CapsuleStatus.LOCKED,
];

class RetryableCapsuleConflict extends Error {}

export function capsuleDueEventKey(capsuleId: string): string {
  return `capsule:${capsuleId}:due`;
}

/**
 * Links wish completion to sealed capsules inside the caller's transaction.
 * It deliberately reads no capsule content and emits no notification itself;
 * the persisted CAPSULE_DUE worker event performs the idempotent transition.
 */
export async function scheduleWishCompletionCapsules(
  database: Prisma.TransactionClient,
  input: {
    coupleId: string;
    wishId: string;
    completedAt: Date;
  },
): Promise<number> {
  const capsules = await database.capsule.findMany({
    where: {
      coupleId: input.coupleId,
      wishId: input.wishId,
      unlockRule: CapsuleUnlockRule.WISH_COMPLETION,
      status: { in: [...CAPSULE_STATUS_LOCKED] },
      dueAt: null,
      deletedAt: null,
    },
    orderBy: { id: "asc" },
    select: { id: true, version: true },
  });

  for (const capsule of capsules) {
    const changed = await database.capsule.updateMany({
      where: {
        id: capsule.id,
        coupleId: input.coupleId,
        wishId: input.wishId,
        unlockRule: CapsuleUnlockRule.WISH_COMPLETION,
        status: { in: [...CAPSULE_STATUS_LOCKED] },
        dueAt: null,
        deletedAt: null,
        version: capsule.version,
      },
      data: {
        dueAt: input.completedAt,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    await upsertScheduledEvent(database, {
      coupleId: input.coupleId,
      dedupeKey: capsuleDueEventKey(capsule.id),
      type: "CAPSULE_DUE",
      payload: { capsuleId: capsule.id },
      runAt: input.completedAt,
    });
  }
  return capsules.length;
}

function parseOptionalInstant(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) {
    throw validationFailed(`${field} must be a valid ISO 8601 instant`);
  }
  return result;
}

function databaseDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function instantDate(value: { epochMilliseconds: number }): Date {
  return new Date(value.epochMilliseconds);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function hasCreatorOnlyUpdate(dto: UpdateCapsuleDto): boolean {
  return (
    dto.title !== undefined ||
    dto.type !== undefined ||
    dto.unlockRule !== undefined ||
    dto.unlockAt !== undefined ||
    dto.anniversaryId !== undefined ||
    dto.wishId !== undefined ||
    dto.unlockCondition !== undefined ||
    dto.requiresBothConfirmation !== undefined ||
    dto.mediaIds !== undefined
  );
}

function hasUpdate(dto: UpdateCapsuleDto): boolean {
  return hasCreatorOnlyUpdate(dto) || dto.message !== undefined;
}

function canonicalDigest(capsule: {
  title: string;
  type: CapsuleType;
  unlockRule: CapsuleUnlockRule;
  unlockAt: Date | null;
  anniversaryId: string | null;
  wishId: string | null;
  unlockCondition: string | null;
  requiresBothConfirmation: boolean;
  messages: Array<{ authorId: string; content: string }>;
  media: Array<{ mediaAssetId: string; sortOrder: number }>;
}): string {
  const payload = {
    title: capsule.title,
    type: capsule.type,
    unlockRule: capsule.unlockRule,
    unlockAt: capsule.unlockAt?.toISOString() ?? null,
    anniversaryId: capsule.anniversaryId,
    wishId: capsule.wishId,
    unlockCondition: capsule.unlockCondition,
    requiresBothConfirmation: capsule.requiresBothConfirmation,
    messages: [...capsule.messages]
      .sort((left, right) => left.authorId.localeCompare(right.authorId))
      .map((message) => ({
        authorId: message.authorId,
        content: message.content,
      })),
    media: [...capsule.media]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.mediaAssetId.localeCompare(right.mediaAssetId),
      )
      .map((item) => ({
        mediaAssetId: item.mediaAssetId,
        sortOrder: item.sortOrder,
      })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

@Injectable()
export class CapsulesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(AuditService)
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  async list(role: IdentityRole): Promise<CapsuleSummary[]> {
    const actor = await this.identities.current(role);
    const records = await this.prisma.capsule.findMany({
      where: {
        coupleId: actor.couple.id,
        deletedAt: null,
        OR: [
          { type: { not: CapsuleType.TO_SELF } },
          { type: CapsuleType.TO_SELF, createdById: actor.user.id },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: capsuleMetadataSelect,
    });
    const now = this.clock.now();
    return records.map((record) =>
      toCapsuleSummary(record, actor.user.id, actor.couple, now),
    );
  }

  async get(role: IdentityRole, capsuleId: string): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    return this.detailForActor(actor, capsuleId);
  }

  async create(
    role: IdentityRole,
    dto: CreateCapsuleDto,
  ): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const configuration: CapsuleConfiguration = {
      type: dto.type as CapsuleType,
      unlockRule: dto.unlockRule as CapsuleUnlockRule,
      unlockAt: parseOptionalInstant(dto.unlockAt, "unlockAt") ?? null,
      anniversaryId: dto.anniversaryId ?? null,
      wishId: dto.wishId ?? null,
      unlockCondition: dto.unlockCondition ?? null,
      requiresBothConfirmation: dto.requiresBothConfirmation ?? false,
    };
    this.assertRuleShape(configuration);
    const mediaIds = dto.mediaIds ?? [];

    const capsuleId = await this.serializable(async (transaction) => {
      await this.assertRuleReferences(
        transaction,
        actor.couple.id,
        configuration,
      );
      await this.assertMedia(
        transaction,
        actor.couple.id,
        actor.user.id,
        mediaIds,
      );
      const capsule = await transaction.capsule.create({
        data: {
          coupleId: actor.couple.id,
          createdById: actor.user.id,
          title: dto.title,
          type: configuration.type,
          unlockRule: configuration.unlockRule,
          unlockAt: configuration.unlockAt,
          anniversaryId: configuration.anniversaryId,
          wishId: configuration.wishId,
          unlockCondition: configuration.unlockCondition,
          requiresBothConfirmation: configuration.requiresBothConfirmation,
          messages: {
            create: { authorId: actor.user.id, content: dto.message },
          },
          ...(mediaIds.length === 0
            ? {}
            : {
                media: {
                  create: mediaIds.map((mediaAssetId, sortOrder) => ({
                    mediaAssetId,
                    sortOrder,
                  })),
                },
              }),
        },
        select: {
          id: true,
          coupleId: true,
          type: true,
          createdById: true,
          version: true,
        },
      });
      await this.publishActorMutation(transaction, actor, capsule, {
        eventType: "capsule.created",
        notificationType: "CAPSULE_CREATED",
        dedupeKey: `capsule:${capsule.id}:v${capsule.version}:created`,
        now,
      });
      return capsule.id;
    });
    return this.detailForActor(actor, capsuleId);
  }

  async update(
    role: IdentityRole,
    capsuleId: string,
    dto: UpdateCapsuleDto,
  ): Promise<CapsuleDetail> {
    if (!hasUpdate(dto))
      throw validationFailed("At least one field is required");
    const actor = await this.identities.current(role);
    const now = this.clock.now();

    await this.serializable(async (transaction) => {
      const current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      this.assertVersion(current, dto.version);
      if (current.status !== CapsuleStatus.DRAFT) {
        throw stateConflict({ currentStatus: current.status });
      }
      const isCreator = current.createdById === actor.user.id;
      if (!isCreator && current.type !== CapsuleType.JOINT) {
        throw actionForbidden();
      }
      if (
        !isCreator &&
        (hasCreatorOnlyUpdate(dto) || dto.message === undefined)
      ) {
        throw actionForbidden();
      }

      const draft = await transaction.capsule.findFirst({
        where: {
          id: capsuleId,
          coupleId: actor.couple.id,
          deletedAt: null,
          status: CapsuleStatus.DRAFT,
        },
        select: { unlockCondition: true },
      });
      if (!draft) throw stateConflict();

      const nextConfiguration = this.updatedConfiguration(
        current,
        draft.unlockCondition,
        dto,
      );
      this.assertRuleShape(nextConfiguration);
      await this.assertRuleReferences(
        transaction,
        actor.couple.id,
        nextConfiguration,
      );
      if (dto.mediaIds !== undefined) {
        await this.assertMedia(
          transaction,
          actor.couple.id,
          actor.user.id,
          dto.mediaIds,
        );
      }

      const changed = await transaction.capsule.updateMany({
        where: {
          id: capsuleId,
          coupleId: actor.couple.id,
          deletedAt: null,
          status: CapsuleStatus.DRAFT,
          version: dto.version,
        },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          type: nextConfiguration.type,
          unlockRule: nextConfiguration.unlockRule,
          unlockAt: nextConfiguration.unlockAt,
          anniversaryId: nextConfiguration.anniversaryId,
          wishId: nextConfiguration.wishId,
          unlockCondition: nextConfiguration.unlockCondition,
          requiresBothConfirmation: nextConfiguration.requiresBothConfirmation,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();

      if (dto.message !== undefined) {
        await transaction.capsuleMessage.upsert({
          where: {
            capsuleId_authorId: {
              capsuleId,
              authorId: actor.user.id,
            },
          },
          create: {
            capsuleId,
            authorId: actor.user.id,
            content: dto.message,
          },
          update: {
            content: dto.message,
            version: { increment: 1 },
          },
          select: { id: true },
        });
      }
      if (nextConfiguration.type !== CapsuleType.JOINT) {
        await transaction.capsuleMessage.deleteMany({
          where: { capsuleId, authorId: { not: current.createdById } },
        });
      }
      if (dto.mediaIds !== undefined) {
        await transaction.capsuleMedia.deleteMany({ where: { capsuleId } });
        if (dto.mediaIds.length > 0) {
          await transaction.capsuleMedia.createMany({
            data: dto.mediaIds.map((mediaAssetId, sortOrder) => ({
              capsuleId,
              mediaAssetId,
              sortOrder,
            })),
          });
        }
      }

      if (
        current.type !== CapsuleType.TO_SELF &&
        nextConfiguration.type === CapsuleType.TO_SELF
      ) {
        const removedAudience = actor.couple.members
          .map((member) => member.id)
          .filter((memberId) => memberId !== actor.user.id);
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `capsule:${capsuleId}:v${dto.version + 1}:hidden`,
          aggregateType: "CAPSULE",
          aggregateId: capsuleId,
          eventType: "capsule.hidden",
          actorId: actor.user.id,
          recipientIds: removedAudience,
          occurredAt: now,
        });
      }

      await this.publishActorMutation(
        transaction,
        actor,
        {
          ...current,
          type: nextConfiguration.type,
        },
        {
          eventType: "capsule.updated",
          notificationType: "CAPSULE_UPDATED",
          dedupeKey: `capsule:${capsuleId}:v${dto.version + 1}:updated`,
          now,
        },
      );
    });
    return this.detailForActor(actor, capsuleId);
  }

  async remove(
    role: IdentityRole,
    capsuleId: string,
    version: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      this.assertVersion(current, version);
      if (current.createdById !== actor.user.id) throw actionForbidden();
      if (current.status !== CapsuleStatus.DRAFT) {
        throw stateConflict({ currentStatus: current.status });
      }
      const changed = await transaction.capsule.updateMany({
        where: {
          id: capsuleId,
          coupleId: actor.couple.id,
          deletedAt: null,
          status: CapsuleStatus.DRAFT,
          version,
        },
        data: { deletedAt: now, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw stateConflict();
      await cancelScheduledEvent(transaction, capsuleDueEventKey(capsuleId));
      await createRecycleBinItem(transaction, {
        coupleId: actor.couple.id,
        resourceType: RecycleBinResourceType.CAPSULE,
        resourceId: capsuleId,
        deletedById: actor.user.id,
        deletedAt: now,
        restoreData: { status: current.status },
        visibility: RecycleBinVisibility.OWNER_ONLY,
        ownerId: actor.user.id,
      });
      await this.publishActorMutation(transaction, actor, current, {
        eventType: "capsule.deleted",
        notificationType: "CAPSULE_DELETED",
        dedupeKey: `capsule:${capsuleId}:v${version + 1}:deleted`,
        now,
      });
    });
  }

  async seal(
    role: IdentityRole,
    capsuleId: string,
    version: number,
  ): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();

    await this.serializable(async (transaction) => {
      const current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      this.assertVersion(current, version);
      if (current.createdById !== actor.user.id) throw actionForbidden();
      if (current.status !== CapsuleStatus.DRAFT) {
        throw stateConflict({ currentStatus: current.status });
      }

      const draft = await transaction.capsule.findFirst({
        where: {
          id: capsuleId,
          coupleId: actor.couple.id,
          deletedAt: null,
          status: CapsuleStatus.DRAFT,
        },
        select: {
          title: true,
          type: true,
          unlockRule: true,
          unlockAt: true,
          anniversaryId: true,
          wishId: true,
          unlockCondition: true,
          requiresBothConfirmation: true,
          messages: {
            orderBy: { authorId: "asc" },
            select: { authorId: true, content: true },
          },
          media: {
            orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
            select: { mediaAssetId: true, sortOrder: true },
          },
        },
      });
      if (!draft) throw stateConflict();
      const configuration: CapsuleConfiguration = {
        type: draft.type,
        unlockRule: draft.unlockRule,
        unlockAt: draft.unlockAt,
        anniversaryId: draft.anniversaryId,
        wishId: draft.wishId,
        unlockCondition: draft.unlockCondition,
        requiresBothConfirmation: draft.requiresBothConfirmation,
      };
      this.assertRuleShape(configuration);
      const references = await this.assertRuleReferences(
        transaction,
        actor.couple.id,
        configuration,
      );
      await this.assertMedia(
        transaction,
        actor.couple.id,
        actor.user.id,
        draft.media.map((item) => item.mediaAssetId),
      );
      if (
        draft.type === CapsuleType.JOINT &&
        unique(draft.messages.map((message) => message.authorId)).length !==
          actor.couple.members.length
      ) {
        throw stateConflict({ reason: "JOINT_MESSAGES_INCOMPLETE" });
      }

      const dueAt = this.sealedDueAt(
        configuration,
        references,
        actor.couple.timezone,
        now,
      );
      const digest = canonicalDigest(draft);
      const changed = await transaction.capsule.updateMany({
        where: {
          id: capsuleId,
          coupleId: actor.couple.id,
          deletedAt: null,
          status: CapsuleStatus.DRAFT,
          version,
        },
        data: {
          status: CapsuleStatus.LOCKED,
          sealedAt: now,
          dueAt,
          sealedDigest: digest,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      if (dueAt !== null) {
        await upsertScheduledEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: capsuleDueEventKey(capsuleId),
          type: "CAPSULE_DUE",
          payload: { capsuleId },
          runAt: dueAt,
        });
      }
      await this.publishActorMutation(transaction, actor, current, {
        eventType: "capsule.sealed",
        notificationType: "CAPSULE_SEALED",
        dedupeKey: `capsule:${capsuleId}:v${version + 1}:sealed`,
        now,
      });
      await this.audit.record(
        {
          action: "CAPSULE_SEALED",
          actorId: actor.user.id,
          coupleId: actor.couple.id,
          resourceType: "CAPSULE",
          resourceId: capsuleId,
          metadata: {
            resourceId: capsuleId,
            status: CapsuleStatus.LOCKED,
            version: version + 1,
          },
        },
        transaction,
      );
    });
    return this.detailForActor(actor, capsuleId);
  }

  async markConditionMet(
    role: IdentityRole,
    capsuleId: string,
    version: number,
  ): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      if (
        current.unlockRule !== CapsuleUnlockRule.MANUAL_CONDITION &&
        current.unlockRule !== CapsuleUnlockRule.WISH_COMPLETION
      ) {
        throw stateConflict({ unlockRule: current.unlockRule });
      }
      if (
        current.status === CapsuleStatus.DUE ||
        current.status === CapsuleStatus.UNLOCKED ||
        current.status === CapsuleStatus.OPENED ||
        current.status === CapsuleStatus.CONVERTED_TO_MEMORY
      ) {
        return;
      }
      this.assertVersion(current, version);
      if (!CAPSULE_STATUS_LOCKED.includes(current.status)) {
        throw stateConflict({ currentStatus: current.status });
      }

      const dueAt =
        current.unlockRule === CapsuleUnlockRule.MANUAL_CONDITION
          ? now
          : capsuleDerivedDueAt(current);
      if (dueAt === null || dueAt > now) {
        throw stateConflict({ reason: "UNLOCK_CONDITION_NOT_MET" });
      }
      await upsertScheduledEvent(transaction, {
        coupleId: current.coupleId,
        dedupeKey: capsuleDueEventKey(capsuleId),
        type: "CAPSULE_DUE",
        payload: { capsuleId },
        runAt: dueAt,
      });
      await this.materializeDue(transaction, { ...current, dueAt }, now);
    });
    return this.detailForActor(actor, capsuleId);
  }

  async confirmOpen(
    role: IdentityRole,
    capsuleId: string,
    version: number,
  ): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      let current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      const existing = current.openRecords.find(
        (record) => record.userId === actor.user.id,
      );
      if (
        existing?.confirmedAt !== null &&
        existing?.confirmedAt !== undefined
      ) {
        return;
      }
      if (version > current.version) this.assertVersion(current, version);
      if (
        CAPSULE_STATUS_LOCKED.includes(current.status) &&
        version !== current.version
      ) {
        this.assertVersion(current, version);
      }
      current = await this.materializeDue(transaction, current, now);
      if (
        current.status !== CapsuleStatus.DUE ||
        !current.requiresBothConfirmation
      ) {
        throw stateConflict({ currentStatus: current.status });
      }

      await transaction.capsuleOpenRecord.upsert({
        where: {
          capsuleId_userId: { capsuleId, userId: actor.user.id },
        },
        create: {
          capsuleId,
          userId: actor.user.id,
          confirmedAt: now,
        },
        update: { confirmedAt: now },
        select: { id: true },
      });
      const confirmationCount = await transaction.capsuleOpenRecord.count({
        where: { capsuleId, confirmedAt: { not: null } },
      });
      await this.publishActorMutation(transaction, actor, current, {
        eventType: "capsule.open_confirmed",
        notificationType: "CAPSULE_OPEN_CONFIRMED",
        dedupeKey: `capsule:${capsuleId}:confirmed:${actor.user.id}`,
        now,
      });

      if (confirmationCount >= actor.couple.members.length) {
        const changed = await transaction.capsule.updateMany({
          where: {
            id: capsuleId,
            coupleId: actor.couple.id,
            deletedAt: null,
            status: CapsuleStatus.DUE,
            version: current.version,
          },
          data: {
            status: CapsuleStatus.UNLOCKED,
            unlockedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new RetryableCapsuleConflict();
        await this.publishActorMutation(transaction, actor, current, {
          eventType: "capsule.unlocked",
          notificationType: "CAPSULE_UNLOCKED",
          dedupeKey: `capsule:${capsuleId}:unlocked`,
          now,
        });
      }
    });
    return this.detailForActor(actor, capsuleId);
  }

  async open(
    role: IdentityRole,
    capsuleId: string,
    version: number,
  ): Promise<CapsuleDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      let current = await this.findMetadata(
        transaction,
        actor.couple.id,
        capsuleId,
      );
      this.assertVisible(current, actor.user.id);
      if (!canOpenCapsuleType(current, actor.user.id)) throw actionForbidden();
      const existing = current.openRecords.find(
        (record) => record.userId === actor.user.id,
      );
      if (existing?.openedAt !== null && existing?.openedAt !== undefined)
        return;
      if (version > current.version) this.assertVersion(current, version);
      if (
        CAPSULE_STATUS_LOCKED.includes(current.status) &&
        version !== current.version
      ) {
        this.assertVersion(current, version);
      }
      current = await this.materializeDue(transaction, current, now);
      if (
        current.status !== CapsuleStatus.UNLOCKED &&
        current.status !== CapsuleStatus.OPENED &&
        current.status !== CapsuleStatus.CONVERTED_TO_MEMORY
      ) {
        throw stateConflict({ currentStatus: current.status });
      }

      await transaction.capsuleOpenRecord.upsert({
        where: {
          capsuleId_userId: { capsuleId, userId: actor.user.id },
        },
        create: { capsuleId, userId: actor.user.id, openedAt: now },
        update: { openedAt: now },
        select: { id: true },
      });

      if (current.status === CapsuleStatus.UNLOCKED) {
        const changed = await transaction.capsule.updateMany({
          where: {
            id: capsuleId,
            coupleId: actor.couple.id,
            deletedAt: null,
            status: CapsuleStatus.UNLOCKED,
            version: current.version,
          },
          data: {
            status: CapsuleStatus.OPENED,
            openedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw new RetryableCapsuleConflict();
      }
      await this.publishActorMutation(transaction, actor, current, {
        eventType: "capsule.opened",
        notificationType: "CAPSULE_OPENED",
        dedupeKey: `capsule:${capsuleId}:opened:${actor.user.id}`,
        now,
      });
      const openedStatus =
        current.status === CapsuleStatus.UNLOCKED
          ? CapsuleStatus.OPENED
          : current.status;
      const openedVersion =
        current.status === CapsuleStatus.UNLOCKED
          ? current.version + 1
          : current.version;
      await this.audit.record(
        {
          action: "CAPSULE_OPENED",
          actorId: actor.user.id,
          coupleId: actor.couple.id,
          resourceType: "CAPSULE",
          resourceId: capsuleId,
          metadata: {
            resourceId: capsuleId,
            status: openedStatus,
            version: openedVersion,
          },
        },
        transaction,
      );
    });
    return this.detailForActor(actor, capsuleId);
  }

  /** Idempotent worker entry point for a persisted CAPSULE_DUE event. */
  async markDue(capsuleId: string): Promise<void> {
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const current = await transaction.capsule.findFirst({
        where: { id: capsuleId, deletedAt: null },
        select: capsuleMetadataSelect,
      });
      if (!current) return;
      await this.materializeDue(transaction, current, now);
    });
  }

  private async detailForActor(
    actor: IdentityResponse,
    capsuleId: string,
  ): Promise<CapsuleDetail> {
    const metadata = await this.findMetadata(
      this.prisma,
      actor.couple.id,
      capsuleId,
    );
    this.assertVisible(metadata, actor.user.id);
    const now = this.clock.now();
    if (!shouldLoadCapsuleBody(metadata, actor.user.id)) {
      return toCapsuleDetail(metadata, null, actor.user.id, actor.couple, now);
    }
    const content = await this.prisma.capsule.findFirst({
      where: {
        id: capsuleId,
        coupleId: actor.couple.id,
        deletedAt: null,
        ...(metadata.type === CapsuleType.TO_SELF
          ? { createdById: actor.user.id }
          : {}),
        ...(metadata.status === CapsuleStatus.DRAFT
          ? {
              status: CapsuleStatus.DRAFT,
              OR: [{ createdById: actor.user.id }, { type: CapsuleType.JOINT }],
            }
          : {
              openRecords: {
                some: {
                  userId: actor.user.id,
                  openedAt: { not: null },
                },
              },
            }),
      },
      select: capsuleContentSelect,
    });
    if (!content) throw resourceNotFound();
    return toCapsuleDetail(metadata, content, actor.user.id, actor.couple, now);
  }

  private async findMetadata(
    database: Pick<CapsuleDatabase, "capsule">,
    coupleId: string,
    capsuleId: string,
  ): Promise<CapsuleMetadataRecord> {
    const capsule = await database.capsule.findFirst({
      where: { id: capsuleId, coupleId, deletedAt: null },
      select: capsuleMetadataSelect,
    });
    if (!capsule) throw resourceNotFound();
    return capsule;
  }

  private assertVisible(capsule: CapsuleMetadataRecord, actorId: string): void {
    if (!isCapsuleVisibleTo(capsule, actorId)) throw resourceNotFound();
  }

  private assertVersion(capsule: CapsuleMetadataRecord, version: number): void {
    if (capsule.version !== version) {
      throw stateConflict({
        currentVersion: capsule.version,
        currentStatus: capsule.status,
      });
    }
  }

  private updatedConfiguration(
    current: CapsuleMetadataRecord,
    currentCondition: string | null,
    dto: UpdateCapsuleDto,
  ): CapsuleConfiguration {
    const unlockRule = (dto.unlockRule ??
      current.unlockRule) as CapsuleUnlockRule;
    const sameRule = unlockRule === current.unlockRule;
    return {
      type: (dto.type ?? current.type) as CapsuleType,
      unlockRule,
      unlockAt:
        unlockRule === CapsuleUnlockRule.AT_TIME
          ? (parseOptionalInstant(dto.unlockAt, "unlockAt") ??
            (sameRule ? current.unlockAt : null))
          : null,
      anniversaryId:
        unlockRule === CapsuleUnlockRule.ANNIVERSARY
          ? (dto.anniversaryId ?? (sameRule ? current.anniversaryId : null))
          : null,
      wishId:
        unlockRule === CapsuleUnlockRule.WISH_COMPLETION
          ? (dto.wishId ?? (sameRule ? current.wishId : null))
          : null,
      unlockCondition:
        unlockRule === CapsuleUnlockRule.MANUAL_CONDITION
          ? (dto.unlockCondition ?? (sameRule ? currentCondition : null))
          : null,
      requiresBothConfirmation:
        dto.requiresBothConfirmation ?? current.requiresBothConfirmation,
    };
  }

  private assertRuleShape(configuration: CapsuleConfiguration): void {
    if (
      configuration.type === CapsuleType.TO_SELF &&
      configuration.requiresBothConfirmation
    ) {
      throw validationFailed(
        "TO_SELF capsules cannot require both members to confirm",
      );
    }
    if (configuration.unlockRule === CapsuleUnlockRule.AT_TIME) {
      if (configuration.unlockAt === null) {
        throw validationFailed("unlockAt is required for AT_TIME capsules");
      }
      if (
        configuration.anniversaryId !== null ||
        configuration.wishId !== null ||
        configuration.unlockCondition !== null
      ) {
        throw validationFailed("AT_TIME capsules only accept unlockAt");
      }
      return;
    }
    if (configuration.unlockRule === CapsuleUnlockRule.ANNIVERSARY) {
      if (configuration.anniversaryId === null) {
        throw validationFailed(
          "anniversaryId is required for ANNIVERSARY capsules",
        );
      }
      if (
        configuration.unlockAt !== null ||
        configuration.wishId !== null ||
        configuration.unlockCondition !== null
      ) {
        throw validationFailed(
          "ANNIVERSARY capsules only accept anniversaryId",
        );
      }
      return;
    }
    if (configuration.unlockRule === CapsuleUnlockRule.WISH_COMPLETION) {
      if (configuration.wishId === null) {
        throw validationFailed(
          "wishId is required for WISH_COMPLETION capsules",
        );
      }
      if (
        configuration.unlockAt !== null ||
        configuration.anniversaryId !== null ||
        configuration.unlockCondition !== null
      ) {
        throw validationFailed("WISH_COMPLETION capsules only accept wishId");
      }
      return;
    }
    if (configuration.unlockCondition === null) {
      throw validationFailed(
        "unlockCondition is required for MANUAL_CONDITION capsules",
      );
    }
    if (
      configuration.unlockAt !== null ||
      configuration.anniversaryId !== null ||
      configuration.wishId !== null
    ) {
      throw validationFailed(
        "MANUAL_CONDITION capsules only accept unlockCondition",
      );
    }
  }

  private async assertRuleReferences(
    database: Pick<CapsuleDatabase, "anniversary" | "wish">,
    coupleId: string,
    configuration: CapsuleConfiguration,
  ): Promise<RuleReferences> {
    let anniversary: AnniversaryRuleRecord | null = null;
    let wish: WishRuleRecord | null = null;
    if (configuration.anniversaryId !== null) {
      anniversary = await database.anniversary.findFirst({
        where: {
          id: configuration.anniversaryId,
          coupleId,
          deletedAt: null,
        },
        select: { date: true, repeat: true, leapDayRule: true },
      });
      if (!anniversary) throw resourceNotFound();
    }
    if (configuration.wishId !== null) {
      wish = await database.wish.findFirst({
        where: { id: configuration.wishId, coupleId, deletedAt: null },
        select: { status: true, completedAt: true },
      });
      if (!wish) throw resourceNotFound();
    }
    return { anniversary, wish };
  }

  private async assertMedia(
    database: Pick<CapsuleDatabase, "mediaAsset">,
    coupleId: string,
    userId: string,
    mediaIds: string[],
  ): Promise<void> {
    if (mediaIds.length === 0) return;
    if (new Set(mediaIds).size !== mediaIds.length) {
      throw validationFailed("mediaIds must not contain duplicates");
    }
    const count = await database.mediaAsset.count({
      where: {
        id: { in: mediaIds },
        ...readableMediaAssetWhere(coupleId, userId),
      },
    });
    if (count !== mediaIds.length) throw resourceNotFound();
  }

  private sealedDueAt(
    configuration: CapsuleConfiguration,
    references: RuleReferences,
    timeZone: string,
    now: Date,
  ): Date | null {
    if (configuration.unlockRule === CapsuleUnlockRule.AT_TIME) {
      return configuration.unlockAt;
    }
    if (configuration.unlockRule === CapsuleUnlockRule.ANNIVERSARY) {
      const anniversary = references.anniversary;
      if (!anniversary) throw resourceNotFound();
      const occurrence = nextAnniversaryOccurrence(
        databaseDateString(anniversary.date),
        anniversary.repeat,
        anniversary.leapDayRule,
        instantToPlainDate(now, timeZone),
      );
      if (occurrence === null) {
        throw stateConflict({ reason: "ANNIVERSARY_HAS_NO_NEXT_OCCURRENCE" });
      }
      return instantDate(plainDateStartInstant(occurrence, timeZone));
    }
    if (configuration.unlockRule === CapsuleUnlockRule.WISH_COMPLETION) {
      const wish = references.wish;
      if (
        wish !== null &&
        wish.completedAt !== null &&
        (wish.status === "COMPLETED" || wish.status === "CONVERTED_TO_MEMORY")
      ) {
        return wish.completedAt;
      }
    }
    return null;
  }

  private async materializeDue(
    database: CapsuleDatabase,
    current: CapsuleMetadataRecord,
    now: Date,
  ): Promise<CapsuleMetadataRecord> {
    if (!CAPSULE_STATUS_LOCKED.includes(current.status)) return current;
    const dueAt = capsuleDerivedDueAt(current);
    if (dueAt === null || dueAt > now) return current;
    const status = current.requiresBothConfirmation
      ? CapsuleStatus.DUE
      : CapsuleStatus.UNLOCKED;
    const changed = await database.capsule.updateMany({
      where: {
        id: current.id,
        coupleId: current.coupleId,
        deletedAt: null,
        status: { in: [...CAPSULE_STATUS_LOCKED] },
        version: current.version,
      },
      data: {
        status,
        dueAt,
        ...(status === CapsuleStatus.UNLOCKED ? { unlockedAt: now } : {}),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new RetryableCapsuleConflict();
    const updated: CapsuleMetadataRecord = {
      ...current,
      status,
      dueAt,
      unlockedAt: status === CapsuleStatus.UNLOCKED ? now : current.unlockedAt,
      version: current.version + 1,
      updatedAt: now,
    };
    await this.publishDue(database, updated, now);
    return updated;
  }

  private visibleMemberIds(
    capsule: EventCapsule,
    memberIds: string[],
  ): string[] {
    return capsule.type === CapsuleType.TO_SELF
      ? [capsule.createdById]
      : unique(memberIds);
  }

  private openRecipientIds(
    capsule: EventCapsule,
    memberIds: string[],
  ): string[] {
    if (capsule.type === CapsuleType.TO_SELF) return [capsule.createdById];
    if (
      capsule.type === CapsuleType.TO_PARTNER ||
      capsule.type === CapsuleType.FUTURE_LETTER
    ) {
      return memberIds.filter((memberId) => memberId !== capsule.createdById);
    }
    return unique(memberIds);
  }

  private async publishDue(
    database: CapsuleDatabase,
    capsule: CapsuleMetadataRecord,
    now: Date,
  ): Promise<void> {
    const members = await database.coupleMember.findMany({
      where: { coupleId: capsule.coupleId, status: "ACTIVE" },
      orderBy: { slot: "asc" },
      select: { userId: true },
    });
    const memberIds = members.map((member) => member.userId);
    const audience = this.visibleMemberIds(capsule, memberIds);
    const recipients = capsule.requiresBothConfirmation
      ? audience
      : this.openRecipientIds(capsule, memberIds);
    const key = capsuleDueEventKey(capsule.id);
    for (const recipientId of recipients) {
      await createPrivateNotification(database, {
        coupleId: capsule.coupleId,
        recipientId,
        type: "CAPSULE_DUE",
        dedupeKey: `${key}:notification:${recipientId}`,
        resourceType: "CAPSULE",
        resourceId: capsule.id,
      });
    }
    await enqueueOutboxEvent(database, {
      coupleId: capsule.coupleId,
      dedupeKey: key,
      aggregateType: "CAPSULE",
      aggregateId: capsule.id,
      eventType:
        capsule.status === CapsuleStatus.DUE
          ? "capsule.due"
          : "capsule.unlocked",
      recipientIds: audience,
      version: capsule.version,
      occurredAt: now,
    });
  }

  private async publishActorMutation(
    database: CapsuleDatabase,
    actor: IdentityResponse,
    capsule: EventCapsule,
    input: {
      eventType: string;
      notificationType: string;
      dedupeKey: string;
      now: Date;
    },
  ): Promise<void> {
    const audience = this.visibleMemberIds(
      capsule,
      actor.couple.members.map((member) => member.id),
    );
    for (const recipientId of audience) {
      if (recipientId === actor.user.id) continue;
      await createPrivateNotification(database, {
        coupleId: actor.couple.id,
        recipientId,
        type: input.notificationType,
        dedupeKey: `${input.dedupeKey}:notification:${recipientId}`,
        resourceType: "CAPSULE",
        resourceId: capsule.id,
      });
    }
    await enqueueOutboxEvent(database, {
      coupleId: actor.couple.id,
      dedupeKey: input.dedupeKey,
      aggregateType: "CAPSULE",
      aggregateId: capsule.id,
      eventType: input.eventType,
      actorId: actor.user.id,
      recipientIds: audience,
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
        if (error instanceof RetryableCapsuleConflict) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 3
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")
        ) {
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
