import { Inject, Injectable } from "@nestjs/common";
import {
  AnniversaryLeapDayRule,
  AnniversaryRepeat,
  AnniversaryType,
  CapsuleStatus,
  CapsuleType,
  ConversionSourceType,
  ConversionTargetType,
  NoteStatus,
  Prisma,
  WishCategory,
  WishStatus,
} from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import {
  canOpenCapsuleType,
  isCapsuleVisibleTo,
} from "../capsules/capsule.presentation";
import { AuditService } from "../common/audit/audit.service";
import { Clock } from "../common/clock/clock";
import {
  actionForbidden,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { IdempotencyService } from "../common/idempotency/idempotency.service";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  MemoryCreationService,
  type ConvertedMemorySource,
} from "../memories/memory-creation.service";
import type { MemoryDetail } from "../memories/memory.presentation";
import { MemoriesService } from "../memories/memories.service";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
} from "../shared-events/persistent-event";
import {
  parseStoredConversion,
  toStoredConversion,
  type ConversionResult,
} from "./conversion.presentation";
import type {
  ConvertCapsuleToMemoryDto,
  ConvertNoteDto,
  ConvertWishToMemoryDto,
} from "./dto/conversion.dto";

const NOTE_ROUTE = (id: string) => `POST /api/v1/notes/${id}/convert`;
const WISH_ROUTE = (id: string) =>
  `POST /api/v1/wishes/${id}/convert-to-memory`;
const CAPSULE_ROUTE = (id: string) =>
  `POST /api/v1/capsules/${id}/convert-to-memory`;

type ConversionDatabase = Prisma.TransactionClient;

function parseInstant(value: string | undefined, fallback: Date): Date {
  if (value === undefined) return fallback;
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    throw validationFailed("happenedAt must be a valid ISO 8601 instant");
  }
  return instant;
}

function parseLocalDate(value: string | undefined): Date {
  if (value === undefined) {
    throw validationFailed("date is required for an anniversary conversion");
  }
  try {
    const date = Temporal.PlainDate.from(value);
    if (date.toString() !== value) throw new RangeError("not canonical");
    return new Date(`${value}T00:00:00.000Z`);
  } catch {
    throw validationFailed("date must be a valid YYYY-MM-DD local date");
  }
}

function defaultTitle(content: string): string {
  const title = content.replace(/\s+/g, " ").trim().slice(0, 120);
  return title || "从日常留下的一件事";
}

function partner(actor: IdentityResponse) {
  const other = actor.couple.members.find(
    (member) => member.id !== actor.user.id,
  );
  if (!other) throw resourceNotFound();
  return other;
}

function wishMemoryContent(wish: {
  description: string | null;
  expectation: string | null;
  completionNote: string | null;
}): string | null {
  const sections = [
    wish.description,
    wish.expectation ? `当时的期待：${wish.expectation}` : null,
    wish.completionNote ? `完成后的感受：${wish.completionNote}` : null,
  ].filter((value): value is string => Boolean(value));
  return sections.length === 0 ? null : sections.join("\n\n");
}

function capsuleMemoryContent(
  messages: Array<{ authorId: string; content: string }>,
  actor: IdentityResponse,
): string | null {
  if (messages.length === 0) return null;
  if (messages.length === 1) return messages[0]!.content;
  return messages
    .map((message) => {
      const author = actor.couple.members.find(
        (member) => member.id === message.authorId,
      );
      if (!author) throw resourceNotFound();
      const name =
        author.nicknameInRelationship?.trim() || author.displayName.trim();
      return `${name}写下：\n${message.content}`;
    })
    .join("\n\n");
}

@Injectable()
export class ConversionsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
    @Inject(MemoryCreationService)
    private readonly memoryCreation: MemoryCreationService,
    @Inject(MemoriesService)
    private readonly memories: MemoriesService,
    @Inject(AuditService)
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  async convertNote(
    role: IdentityRole,
    noteId: string,
    dto: ConvertNoteDto,
    key: string,
  ): Promise<{ status: number; result: ConversionResult }> {
    const actor = await this.identities.current(role);
    const response = await this.idempotency.execute({
      userId: actor.user.id,
      coupleId: actor.couple.id,
      route: NOTE_ROUTE(noteId),
      key,
      request: dto,
      operation: async (transaction) => {
        const result = await this.convertNoteInTransaction(
          transaction as ConversionDatabase,
          actor,
          noteId,
          dto,
        );
        return { status: result.existing ? 200 : 201, body: result.body };
      },
    });
    return {
      status: response.status,
      result: parseStoredConversion(response.body),
    };
  }

  async convertWishToMemory(
    role: IdentityRole,
    wishId: string,
    dto: ConvertWishToMemoryDto,
    key: string,
  ): Promise<{ status: number; memory: MemoryDetail }> {
    const actor = await this.identities.current(role);
    const response = await this.idempotency.execute({
      userId: actor.user.id,
      coupleId: actor.couple.id,
      route: WISH_ROUTE(wishId),
      key,
      request: dto,
      operation: async (transaction) => {
        const result = await this.convertWishInTransaction(
          transaction as ConversionDatabase,
          actor,
          wishId,
          dto,
        );
        return { status: result.existing ? 200 : 201, body: result.body };
      },
    });
    const conversion = parseStoredConversion(response.body);
    return {
      status: response.status,
      memory: await this.memories.get(role, conversion.targetId),
    };
  }

  async convertCapsuleToMemory(
    role: IdentityRole,
    capsuleId: string,
    dto: ConvertCapsuleToMemoryDto,
    key: string,
  ): Promise<{ status: number; memory: MemoryDetail }> {
    const actor = await this.identities.current(role);
    const response = await this.idempotency.execute({
      userId: actor.user.id,
      coupleId: actor.couple.id,
      route: CAPSULE_ROUTE(capsuleId),
      key,
      request: dto,
      operation: async (transaction) => {
        const result = await this.convertCapsuleInTransaction(
          transaction as ConversionDatabase,
          actor,
          capsuleId,
          dto,
        );
        return { status: result.existing ? 200 : 201, body: result.body };
      },
    });
    const conversion = parseStoredConversion(response.body);
    return {
      status: response.status,
      memory: await this.memories.get(role, conversion.targetId),
    };
  }

  private async convertNoteInTransaction(
    transaction: ConversionDatabase,
    actor: IdentityResponse,
    noteId: string,
    dto: ConvertNoteDto,
  ): Promise<{ existing: boolean; body: Prisma.InputJsonObject }> {
    const note = await transaction.note.findFirst({
      where: {
        id: noteId,
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        version: true,
        content: true,
        createdAt: true,
        status: true,
      },
    });
    if (!note) throw resourceNotFound();
    const previous = await transaction.contentConversion.findUnique({
      where: {
        coupleId_sourceType_sourceId_sourceOccurrence: {
          coupleId: actor.couple.id,
          sourceType: ConversionSourceType.NOTE,
          sourceId: noteId,
          sourceOccurrence: "once",
        },
      },
    });
    if (previous) {
      if (previous.targetType !== dto.targetType) throw stateConflict();
      return {
        existing: true,
        body: toStoredConversion({
          sourceType: previous.sourceType,
          sourceId: previous.sourceId,
          targetType: previous.targetType,
          targetId: previous.targetId,
          convertedAt: previous.convertedAt.toISOString(),
        }),
      };
    }
    if (
      note.status === NoteStatus.ARCHIVED ||
      note.status === NoteStatus.EXPIRED
    ) {
      throw resourceNotFound();
    }
    const title = dto.title?.trim() || defaultTitle(note.content);
    const now = this.clock.now();
    let targetId: string;

    if (dto.targetType === ConversionTargetType.WISH) {
      if (dto.placeId) {
        const place = await transaction.place.findFirst({
          where: {
            id: dto.placeId,
            coupleId: actor.couple.id,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!place) throw resourceNotFound();
      }
      const wish = await transaction.wish.create({
        data: {
          coupleId: actor.couple.id,
          title,
          description: note.content,
          category: dto.category ?? WishCategory.CUSTOM,
          placeId: dto.placeId ?? null,
          sourceNoteId: note.id,
          createdById: actor.user.id,
        },
        select: { id: true },
      });
      await transaction.wishUpdate.create({
        data: {
          wishId: wish.id,
          authorId: actor.user.id,
          toStatus: WishStatus.IDEA,
          note: "由便利贴转化",
        },
      });
      targetId = wish.id;
    } else if (dto.targetType === ConversionTargetType.ANNIVERSARY) {
      const anniversary = await transaction.anniversary.create({
        data: {
          coupleId: actor.couple.id,
          title,
          date: parseLocalDate(dto.date),
          type: dto.anniversaryType ?? AnniversaryType.CUSTOM,
          repeat: dto.repeat ?? AnniversaryRepeat.YEARLY,
          leapDayRule: dto.leapDayRule ?? AnniversaryLeapDayRule.FEBRUARY_28,
          sourceNoteId: note.id,
          createdById: actor.user.id,
        },
        select: { id: true },
      });
      targetId = anniversary.id;
    } else {
      targetId = await this.memoryCreation.createConverted(transaction, actor, {
        source: { type: "NOTE", id: note.id },
        title,
        content: note.content,
        happenedAt: parseInstant(dto.happenedAt, note.createdAt),
        placeId: dto.placeId ?? null,
        mediaIds: [],
      });
    }

    const conversion = await transaction.contentConversion.create({
      data: {
        coupleId: actor.couple.id,
        sourceType: ConversionSourceType.NOTE,
        sourceId: note.id,
        targetType: dto.targetType,
        targetId,
        convertedById: actor.user.id,
      },
    });
    const changed = await transaction.note.updateMany({
      where: {
        id: note.id,
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        deletedAt: null,
        version: note.version,
      },
      data: {
        status: NoteStatus.ARCHIVED,
        archivedAt: now,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    await cancelScheduledEvent(transaction, `note:${note.id}:show`, [
      "PENDING",
      "RETRYING",
      "RUNNING",
    ]);
    await cancelScheduledEvent(transaction, `note:${note.id}:expire`, [
      "PENDING",
      "RETRYING",
      "RUNNING",
    ]);
    await this.publishConversion(transaction, actor, conversion, now);
    await this.audit.record(
      {
        action: `NOTE_CONVERTED_TO_${dto.targetType}`,
        actorId: actor.user.id,
        coupleId: actor.couple.id,
        resourceType: "NOTE",
        resourceId: note.id,
        metadata: {
          resourceId: note.id,
          status: NoteStatus.ARCHIVED,
          version: note.version + 1,
        },
      },
      transaction,
    );
    return {
      existing: false,
      body: toStoredConversion({
        sourceType: conversion.sourceType,
        sourceId: conversion.sourceId,
        targetType: conversion.targetType,
        targetId: conversion.targetId,
        convertedAt: conversion.convertedAt.toISOString(),
      }),
    };
  }

  private async convertWishInTransaction(
    transaction: ConversionDatabase,
    actor: IdentityResponse,
    wishId: string,
    dto: ConvertWishToMemoryDto,
  ): Promise<{ existing: boolean; body: Prisma.InputJsonObject }> {
    const previous = await transaction.contentConversion.findUnique({
      where: {
        coupleId_sourceType_sourceId_sourceOccurrence: {
          coupleId: actor.couple.id,
          sourceType: ConversionSourceType.WISH,
          sourceId: wishId,
          sourceOccurrence: "once",
        },
      },
    });
    if (previous) {
      return {
        existing: true,
        body: toStoredConversion({
          sourceType: previous.sourceType,
          sourceId: previous.sourceId,
          targetType: previous.targetType,
          targetId: previous.targetId,
          convertedAt: previous.convertedAt.toISOString(),
        }),
      };
    }
    const wish = await transaction.wish.findFirst({
      where: { id: wishId, coupleId: actor.couple.id, deletedAt: null },
      select: {
        id: true,
        version: true,
        status: true,
        title: true,
        description: true,
        expectation: true,
        completionNote: true,
        completedAt: true,
        placeId: true,
        media: {
          orderBy: { sortOrder: "asc" },
          select: { mediaAssetId: true },
        },
      },
    });
    if (!wish) throw resourceNotFound();
    if (wish.version !== dto.version) {
      throw stateConflict({ currentVersion: wish.version });
    }
    if (wish.status !== WishStatus.COMPLETED || wish.completedAt === null) {
      throw stateConflict({ currentStatus: wish.status });
    }
    const happenedAt = parseInstant(dto.happenedAt, wish.completedAt);
    const mediaIds =
      dto.mediaIds ?? wish.media.map(({ mediaAssetId }) => mediaAssetId);
    const memoryId = await this.memoryCreation.createConverted(
      transaction,
      actor,
      {
        source: { type: "WISH", id: wish.id } satisfies ConvertedMemorySource,
        title: dto.title?.trim() || wish.title,
        content:
          dto.content === undefined ? wishMemoryContent(wish) : dto.content,
        happenedAt,
        placeId: dto.placeId === undefined ? wish.placeId : dto.placeId,
        mediaIds,
      },
    );
    const now = this.clock.now();
    const changed = await transaction.wish.updateMany({
      where: {
        id: wish.id,
        coupleId: actor.couple.id,
        deletedAt: null,
        version: dto.version,
        status: WishStatus.COMPLETED,
      },
      data: {
        status: WishStatus.CONVERTED_TO_MEMORY,
        convertedAt: now,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    await transaction.wishUpdate.create({
      data: {
        wishId: wish.id,
        authorId: actor.user.id,
        fromStatus: WishStatus.COMPLETED,
        toStatus: WishStatus.CONVERTED_TO_MEMORY,
      },
    });
    const conversion = await transaction.contentConversion.create({
      data: {
        coupleId: actor.couple.id,
        sourceType: ConversionSourceType.WISH,
        sourceId: wish.id,
        targetType: ConversionTargetType.MEMORY,
        targetId: memoryId,
        convertedById: actor.user.id,
      },
    });
    await this.publishConversion(transaction, actor, conversion, now);
    await this.audit.record(
      {
        action: "WISH_CONVERTED_TO_MEMORY",
        actorId: actor.user.id,
        coupleId: actor.couple.id,
        resourceType: "WISH",
        resourceId: wish.id,
        metadata: {
          resourceId: wish.id,
          status: WishStatus.CONVERTED_TO_MEMORY,
          version: dto.version + 1,
        },
      },
      transaction,
    );
    return {
      existing: false,
      body: toStoredConversion({
        sourceType: conversion.sourceType,
        sourceId: conversion.sourceId,
        targetType: conversion.targetType,
        targetId: conversion.targetId,
        convertedAt: conversion.convertedAt.toISOString(),
      }),
    };
  }

  private async convertCapsuleInTransaction(
    transaction: ConversionDatabase,
    actor: IdentityResponse,
    capsuleId: string,
    dto: ConvertCapsuleToMemoryDto,
  ): Promise<{ existing: boolean; body: Prisma.InputJsonObject }> {
    const capsule = await transaction.capsule.findFirst({
      where: {
        id: capsuleId,
        coupleId: actor.couple.id,
        deletedAt: null,
      },
      select: {
        id: true,
        version: true,
        status: true,
        type: true,
        createdById: true,
        title: true,
        openedAt: true,
        openRecords: {
          select: { userId: true, openedAt: true },
        },
      },
    });
    if (!capsule || !isCapsuleVisibleTo(capsule, actor.user.id)) {
      throw resourceNotFound();
    }
    const actorOpen = capsule.openRecords.find(
      (record) => record.userId === actor.user.id,
    );
    if (!actorOpen?.openedAt) {
      throw stateConflict({ reason: "CAPSULE_NOT_OPENED_BY_CURRENT_MEMBER" });
    }
    if (capsule.type === CapsuleType.TO_SELF) throw actionForbidden();
    const openedMemberIds = new Set(
      capsule.openRecords
        .filter((record) => record.openedAt !== null)
        .map((record) => record.userId),
    );
    const allEligibleMembersOpened = actor.couple.members
      .filter((member) => canOpenCapsuleType(capsule, member.id))
      .every((member) => openedMemberIds.has(member.id));
    if (!allEligibleMembersOpened) {
      throw stateConflict({ reason: "CAPSULE_WAITING_FOR_MEMBER_OPEN" });
    }

    const previous = await transaction.contentConversion.findUnique({
      where: {
        coupleId_sourceType_sourceId_sourceOccurrence: {
          coupleId: actor.couple.id,
          sourceType: ConversionSourceType.CAPSULE,
          sourceId: capsuleId,
          sourceOccurrence: "once",
        },
      },
    });
    if (previous) {
      return {
        existing: true,
        body: toStoredConversion({
          sourceType: previous.sourceType,
          sourceId: previous.sourceId,
          targetType: previous.targetType,
          targetId: previous.targetId,
          convertedAt: previous.convertedAt.toISOString(),
        }),
      };
    }
    if (capsule.version !== dto.version) {
      throw stateConflict({ currentVersion: capsule.version });
    }
    if (capsule.status !== CapsuleStatus.OPENED) {
      throw stateConflict({ currentStatus: capsule.status });
    }

    const content = await transaction.capsule.findFirst({
      where: {
        id: capsule.id,
        coupleId: actor.couple.id,
        deletedAt: null,
        status: CapsuleStatus.OPENED,
        version: dto.version,
        openRecords: {
          some: { userId: actor.user.id, openedAt: { not: null } },
        },
        OR: [
          { type: { not: CapsuleType.TO_SELF } },
          { type: CapsuleType.TO_SELF, createdById: actor.user.id },
        ],
      },
      select: {
        messages: {
          orderBy: [{ authorId: "asc" }, { id: "asc" }],
          select: { authorId: true, content: true },
        },
        media: {
          orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
          select: { mediaAssetId: true },
        },
      },
    });
    if (!content) throw stateConflict();

    const memoryId = await this.memoryCreation.createConverted(
      transaction,
      actor,
      {
        source: {
          type: "CAPSULE",
          id: capsule.id,
        } satisfies ConvertedMemorySource,
        title: dto.title?.trim() || capsule.title,
        content:
          dto.content === undefined
            ? capsuleMemoryContent(content.messages, actor)
            : dto.content,
        happenedAt: parseInstant(
          dto.happenedAt,
          capsule.openedAt ?? actorOpen.openedAt,
        ),
        placeId: dto.placeId ?? null,
        mediaIds:
          dto.mediaIds ?? content.media.map(({ mediaAssetId }) => mediaAssetId),
      },
    );
    const now = this.clock.now();
    const changed = await transaction.capsule.updateMany({
      where: {
        id: capsule.id,
        coupleId: actor.couple.id,
        deletedAt: null,
        status: CapsuleStatus.OPENED,
        version: dto.version,
      },
      data: {
        status: CapsuleStatus.CONVERTED_TO_MEMORY,
        convertedAt: now,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw stateConflict();
    const conversion = await transaction.contentConversion.create({
      data: {
        coupleId: actor.couple.id,
        sourceType: ConversionSourceType.CAPSULE,
        sourceId: capsule.id,
        targetType: ConversionTargetType.MEMORY,
        targetId: memoryId,
        convertedById: actor.user.id,
      },
    });
    await this.publishConversion(transaction, actor, conversion, now);
    await this.audit.record(
      {
        action: "CAPSULE_CONVERTED_TO_MEMORY",
        actorId: actor.user.id,
        coupleId: actor.couple.id,
        resourceType: "CAPSULE",
        resourceId: capsule.id,
        metadata: {
          resourceId: capsule.id,
          status: CapsuleStatus.CONVERTED_TO_MEMORY,
          version: dto.version + 1,
        },
      },
      transaction,
    );
    return {
      existing: false,
      body: toStoredConversion({
        sourceType: conversion.sourceType,
        sourceId: conversion.sourceId,
        targetType: conversion.targetType,
        targetId: conversion.targetId,
        convertedAt: conversion.convertedAt.toISOString(),
      }),
    };
  }

  private async publishConversion(
    transaction: ConversionDatabase,
    actor: IdentityResponse,
    conversion: {
      id: string;
      sourceType: ConversionSourceType;
      sourceId: string;
      targetType: ConversionTargetType;
      targetId: string;
    },
    now: Date,
    options: {
      recipientIds?: string[];
      notifyPartner?: boolean;
    } = {},
  ): Promise<void> {
    if (options.notifyPartner !== false) {
      const recipient = partner(actor);
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: recipient.id,
        type: "CONVERSION_COMPLETED",
        dedupeKey: `conversion:${conversion.id}:notification:${recipient.id}`,
        resourceType: conversion.targetType,
        resourceId: conversion.targetId,
      });
    }
    await enqueueOutboxEvent(transaction, {
      coupleId: actor.couple.id,
      dedupeKey: `conversion:${conversion.id}:completed`,
      aggregateType: "CONVERSION",
      aggregateId: conversion.id,
      eventType: "conversion.completed",
      actorId: actor.user.id,
      recipientIds:
        options.recipientIds ?? actor.couple.members.map(({ id }) => id),
      occurredAt: now,
    });
  }
}
