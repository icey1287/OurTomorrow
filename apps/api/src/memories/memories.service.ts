import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  MediaStatus,
  MemoryMediaRole,
  MemoryStatus,
  Prisma,
  ReactionTargetType,
} from "@prisma/client";
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
import type {
  BindMemoryMediaDto,
  CreateMemoryCommentDto,
  CreateMemoryDto,
  ListMemoriesQueryDto,
  SubmitPerspectiveDto,
  UpdateMemoryDto,
  UpsertPerspectiveDto,
} from "./dto/memory.dto";
import {
  type MemoryCardRecord,
  type MemoryCardSummary,
  type MemoryComment,
  type MemoryDetail,
  type MemoryDetailRecord,
  type MemoryPerspectiveView,
  type MemoryRevision,
  type ReactionRecord,
  type ReactionSummary,
  toMemoryCardSummary,
  toMemoryDetail,
  toMemoryRevision,
  toReactionSummaries,
} from "./memory.presentation";

const mediaAssetSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
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

const placeSelect = Prisma.validator<Prisma.PlaceSelect>()({
  id: true,
  version: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  status: true,
  firstVisitedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

const tagSelect = Prisma.validator<Prisma.TagSelect>()({
  id: true,
  version: true,
  name: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const memoryCardSelect = Prisma.validator<Prisma.MemorySelect>()({
  id: true,
  version: true,
  title: true,
  content: true,
  happenedAt: true,
  status: true,
  place: { select: placeSelect },
  coverMedia: { select: mediaAssetSelect },
  tags: { select: { tag: { select: tagSelect } } },
  isFirstTime: true,
  firstTimeLabel: true,
  isPinned: true,
  perspectives: { select: { submittedAt: true } },
  _count: {
    select: { comments: { where: { deletedAt: null } } },
  },
  createdAt: true,
  updatedAt: true,
});

const memoryDetailSelect = Prisma.validator<Prisma.MemorySelect>()({
  ...memoryCardSelect,
  mood: true,
  createdById: true,
  updatedById: true,
  media: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      role: true,
      sortOrder: true,
      mediaAsset: { select: mediaAssetSelect },
    },
  },
  perspectives: {
    select: {
      authorId: true,
      content: true,
      mood: true,
      submittedAt: true,
      version: true,
      updatedAt: true,
    },
  },
  comments: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      authorId: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  },
});

const revisionSnapshotSelect = Prisma.validator<Prisma.MemorySelect>()({
  id: true,
  version: true,
  title: true,
  content: true,
  happenedAt: true,
  placeId: true,
  coverMediaId: true,
  mood: true,
  isFirstTime: true,
  firstTimeLabel: true,
  isPinned: true,
  status: true,
  createdById: true,
  tags: {
    orderBy: { tagId: "asc" },
    select: { tagId: true },
  },
  media: {
    orderBy: [{ sortOrder: "asc" }, { mediaAssetId: "asc" }],
    select: {
      mediaAssetId: true,
      role: true,
      sortOrder: true,
    },
  },
});

type RevisionSnapshot = Prisma.MemoryGetPayload<{
  select: typeof revisionSnapshotSelect;
}>;

type MemoryCursor = {
  version: 1;
  filterHash: string;
  isPinned: boolean;
  happenedAt: string;
  id: string;
};

export type PaginatedMemories = {
  items: MemoryCardSummary[];
  meta: { nextCursor: string | null; hasMore: boolean };
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function preconditionRequired(message: string): ApiException {
  return new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "PRECONDITION_REQUIRED",
    message,
  );
}

function actionForbidden(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    "ACTION_FORBIDDEN",
    "This action is not allowed",
  );
}

function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw validationFailed(`${field} must be a valid ISO 8601 instant`);
  }
  return date;
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const difference = represented - desired;
    if (difference === 0) break;
    guess -= difference;
  }
  return new Date(guess);
}

function dateRange(
  year: number,
  month: number | undefined,
  timeZone: string,
): { gte: Date; lt: Date } {
  const startMonth = month ?? 1;
  const nextYear = month === undefined || month === 12 ? year + 1 : year;
  const nextMonth = month === undefined || month === 12 ? 1 : month + 1;
  return {
    gte: zonedDateTimeToUtc(year, startMonth, 1, timeZone),
    lt: zonedDateTimeToUtc(nextYear, nextMonth, 1, timeZone),
  };
}

function encodeCursor(
  memory: {
    isPinned: boolean;
    happenedAt: Date;
    id: string;
  },
  filterHash: string,
): string {
  const cursor: MemoryCursor = {
    version: 1,
    filterHash,
    isPinned: memory.isPinned,
    happenedAt: memory.happenedAt.toISOString(),
    id: memory.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string, expectedFilterHash: string): MemoryCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MemoryCursor>;
    const happenedAt = new Date(parsed.happenedAt ?? "");
    if (
      parsed.version !== 1 ||
      parsed.filterHash !== expectedFilterHash ||
      typeof parsed.isPinned !== "boolean" ||
      typeof parsed.id !== "string" ||
      !UUID.test(parsed.id) ||
      Number.isNaN(happenedAt.valueOf()) ||
      happenedAt.toISOString() !== parsed.happenedAt
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as MemoryCursor;
  } catch {
    throw validationFailed("cursor is invalid or expired");
  }
}

function memoryFilterHash(
  actor: IdentityResponse,
  query: ListMemoriesQueryDto,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        coupleId: actor.couple.id,
        userId: actor.user.id,
        year: query.year ?? null,
        month: query.month ?? null,
        tagId: query.tagId ?? null,
        placeId: query.placeId ?? null,
        firstTime: query.firstTime ?? null,
        perspectiveState: query.perspectiveState ?? null,
        query: query.query ?? null,
      }),
    )
    .digest("base64url")
    .slice(0, 24);
}

function cursorWhere(cursor: MemoryCursor): Prisma.MemoryWhereInput {
  const laterWithinPinGroup: Prisma.MemoryWhereInput = {
    OR: [
      { happenedAt: { lt: new Date(cursor.happenedAt) } },
      {
        happenedAt: new Date(cursor.happenedAt),
        id: { lt: cursor.id },
      },
    ],
  };
  if (cursor.isPinned) {
    return {
      OR: [{ isPinned: true, ...laterWithinPinGroup }, { isPinned: false }],
    };
  }
  return { isPinned: false, ...laterWithinPinGroup };
}

function json(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function snapshotValue(snapshot: RevisionSnapshot): Record<string, unknown> {
  return {
    title: snapshot.title,
    content: snapshot.content,
    happenedAt: snapshot.happenedAt.toISOString(),
    placeId: snapshot.placeId,
    coverMediaId: snapshot.coverMediaId,
    mood: snapshot.mood,
    isFirstTime: snapshot.isFirstTime,
    firstTimeLabel: snapshot.firstTimeLabel,
    isPinned: snapshot.isPinned,
    status: snapshot.status,
    tagIds: snapshot.tags.map(({ tagId }) => tagId),
    media: snapshot.media.map(({ mediaAssetId, role, sortOrder }) => ({
      mediaId: mediaAssetId,
      role,
      sortOrder,
    })),
  };
}

function changesBetween(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Prisma.InputJsonObject {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return json(changes);
}

function initialChanges(
  snapshot: Record<string, unknown>,
): Prisma.InputJsonObject {
  return json(
    Object.fromEntries(
      Object.entries(snapshot).map(([field, value]) => [
        field,
        { from: null, to: value ?? null },
      ]),
    ),
  );
}

@Injectable()
export class MemoriesService {
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
    query: ListMemoriesQueryDto,
  ): Promise<PaginatedMemories> {
    const actor = await this.identities.current(role);
    if (query.month !== undefined && query.year === undefined) {
      throw validationFailed("year is required when month is provided");
    }
    const memberIds = actor.couple.members.map((member) => member.id);
    const filterHash = memoryFilterHash(actor, query);
    const submittedByBoth: Prisma.MemoryWhereInput = {
      AND: memberIds.map((authorId) => ({
        perspectives: { some: { authorId, submittedAt: { not: null } } },
      })),
    };
    const filters: Prisma.MemoryWhereInput[] = [
      {
        OR: [
          { status: MemoryStatus.PUBLISHED },
          { status: MemoryStatus.DRAFT, createdById: actor.user.id },
        ],
      },
    ];
    if (query.year !== undefined) {
      filters.push({
        happenedAt: dateRange(query.year, query.month, actor.couple.timezone),
      });
    }
    if (query.tagId !== undefined) {
      filters.push({
        tags: {
          some: {
            tagId: query.tagId,
            tag: { coupleId: actor.couple.id, deletedAt: null },
          },
        },
      });
    }
    if (query.placeId !== undefined) {
      filters.push({
        placeId: query.placeId,
        place: { coupleId: actor.couple.id, deletedAt: null },
      });
    }
    if (query.firstTime !== undefined) {
      filters.push({ isFirstTime: query.firstTime });
    }
    if (query.perspectiveState !== undefined) {
      filters.push(
        query.perspectiveState === "complete"
          ? submittedByBoth
          : { NOT: submittedByBoth },
      );
    }
    if (query.query !== undefined) {
      filters.push({
        OR: [
          { title: { contains: query.query, mode: "insensitive" } },
          { content: { contains: query.query, mode: "insensitive" } },
          {
            place: {
              coupleId: actor.couple.id,
              deletedAt: null,
              name: { contains: query.query, mode: "insensitive" },
            },
          },
        ],
      });
    }
    if (query.cursor !== undefined) {
      filters.push(cursorWhere(decodeCursor(query.cursor, filterHash)));
    }
    const where: Prisma.MemoryWhereInput = {
      coupleId: actor.couple.id,
      deletedAt: null,
      AND: filters,
    };

    const records = await this.prisma.memory.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { happenedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: memoryCardSelect,
    });
    const hasMore = records.length > query.limit;
    const page = hasMore ? records.slice(0, query.limit) : records;
    const reactions = await this.reactionsFor(
      actor.couple.id,
      page.map((memory) => memory.id),
    );

    return {
      items: page.map((memory) =>
        toMemoryCardSummary(
          memory as MemoryCardRecord,
          actor.user.id,
          reactions.get(memory.id) ?? [],
        ),
      ),
      meta: {
        nextCursor:
          hasMore && page.length > 0
            ? encodeCursor(page[page.length - 1]!, filterHash)
            : null,
        hasMore,
      },
    };
  }

  async create(
    role: IdentityRole,
    dto: CreateMemoryDto,
  ): Promise<MemoryDetail> {
    const actor = await this.identities.current(role);
    const happenedAt = parseInstant(dto.happenedAt, "happenedAt");
    if (happenedAt > this.clock.now()) {
      throw validationFailed("happenedAt cannot be in the future");
    }
    this.validateFirstTime(
      dto.isFirstTime ?? false,
      dto.firstTimeLabel ?? null,
    );
    const tagIds = dto.tagIds ?? [];
    const mediaIds = dto.mediaIds ?? [];
    if (
      dto.coverMediaId !== undefined &&
      dto.coverMediaId !== null &&
      !mediaIds.includes(dto.coverMediaId)
    ) {
      throw validationFailed("coverMediaId must be included in mediaIds");
    }

    const memoryId = await this.serializable(async (transaction) => {
      await this.assertPlace(transaction, actor.couple.id, dto.placeId);
      await this.assertTags(transaction, actor.couple.id, tagIds);
      await this.assertMedia(transaction, actor.couple.id, mediaIds);
      const coverMediaId =
        dto.coverMediaId === undefined
          ? (mediaIds[0] ?? null)
          : dto.coverMediaId;
      const memory = await transaction.memory.create({
        data: {
          coupleId: actor.couple.id,
          createdById: actor.user.id,
          updatedById: actor.user.id,
          title: dto.title,
          content: dto.content === "" ? null : (dto.content ?? null),
          happenedAt,
          placeId: dto.placeId ?? null,
          coverMediaId,
          mood: dto.mood === "" ? null : (dto.mood ?? null),
          isFirstTime: dto.isFirstTime ?? false,
          firstTimeLabel:
            dto.firstTimeLabel === "" ? null : (dto.firstTimeLabel ?? null),
          isPinned: dto.isPinned ?? false,
          status: dto.status ?? MemoryStatus.PUBLISHED,
          ...(tagIds.length === 0
            ? {}
            : {
                tags: {
                  createMany: {
                    data: tagIds.map((tagId) => ({ tagId })),
                  },
                },
              }),
          ...(mediaIds.length === 0
            ? {}
            : {
                media: {
                  createMany: {
                    data: mediaIds.map((mediaAssetId, sortOrder) => ({
                      mediaAssetId,
                      sortOrder,
                      role:
                        mediaAssetId === coverMediaId
                          ? MemoryMediaRole.COVER
                          : MemoryMediaRole.GALLERY,
                    })),
                  },
                },
              }),
        },
        select: revisionSnapshotSelect,
      });
      if (memory.status === MemoryStatus.PUBLISHED) {
        await transaction.contentRevision.create({
          data: {
            coupleId: actor.couple.id,
            resourceType: "MEMORY",
            resourceId: memory.id,
            version: memory.version,
            authorId: actor.user.id,
            changes: initialChanges(snapshotValue(memory)),
          },
        });
      }
      return memory.id;
    });
    return this.detailForActor(actor, memoryId);
  }

  async get(role: IdentityRole, memoryId: string): Promise<MemoryDetail> {
    const actor = await this.identities.current(role);
    return this.detailForActor(actor, memoryId);
  }

  async update(
    role: IdentityRole,
    memoryId: string,
    dto: UpdateMemoryDto,
    ifMatch?: string,
  ): Promise<MemoryDetail> {
    const actor = await this.identities.current(role);
    this.assertEtag(memoryId, dto.version, ifMatch);
    const fields = Object.keys(dto).filter((field) => field !== "version");
    if (fields.length === 0) {
      throw validationFailed("At least one memory field must be updated");
    }
    const happenedAt =
      dto.happenedAt === undefined
        ? undefined
        : parseInstant(dto.happenedAt, "happenedAt");
    if (happenedAt && happenedAt > this.clock.now()) {
      throw validationFailed("happenedAt cannot be in the future");
    }

    await this.serializable(async (transaction) => {
      const before = await transaction.memory.findFirst({
        where: this.editableWhere(actor, memoryId),
        select: revisionSnapshotSelect,
      });
      if (!before) throw resourceNotFound();
      if (
        dto.status === MemoryStatus.DRAFT &&
        before.status !== MemoryStatus.DRAFT
      ) {
        throw validationFailed("A published memory cannot return to draft");
      }
      if (
        dto.isFirstTime === false &&
        dto.firstTimeLabel !== undefined &&
        dto.firstTimeLabel !== null &&
        dto.firstTimeLabel !== ""
      ) {
        throw validationFailed(
          "firstTimeLabel cannot be set when isFirstTime is false",
        );
      }
      const nextIsFirstTime = dto.isFirstTime ?? before.isFirstTime;
      const nextFirstTimeLabel =
        dto.isFirstTime === false
          ? null
          : dto.firstTimeLabel === undefined
            ? before.firstTimeLabel
            : dto.firstTimeLabel === ""
              ? null
              : dto.firstTimeLabel;
      this.validateFirstTime(nextIsFirstTime, nextFirstTimeLabel);
      await this.assertPlace(transaction, actor.couple.id, dto.placeId);
      await this.assertTags(transaction, actor.couple.id, dto.tagIds ?? []);

      const changed = await transaction.memory.updateMany({
        where: {
          ...this.editableWhere(actor, memoryId),
          version: dto.version,
        },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.content === undefined
            ? {}
            : { content: dto.content === "" ? null : dto.content }),
          ...(happenedAt === undefined ? {} : { happenedAt }),
          ...(dto.placeId === undefined ? {} : { placeId: dto.placeId }),
          ...(dto.mood === undefined
            ? {}
            : { mood: dto.mood === "" ? null : dto.mood }),
          ...(dto.isFirstTime === undefined
            ? {}
            : { isFirstTime: dto.isFirstTime }),
          ...(dto.firstTimeLabel === undefined && dto.isFirstTime !== false
            ? {}
            : { firstTimeLabel: nextFirstTimeLabel }),
          ...(dto.isPinned === undefined ? {} : { isPinned: dto.isPinned }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          updatedById: actor.user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();

      if (dto.tagIds !== undefined) {
        await transaction.memoryTag.deleteMany({ where: { memoryId } });
        if (dto.tagIds.length > 0) {
          await transaction.memoryTag.createMany({
            data: dto.tagIds.map((tagId) => ({ memoryId, tagId })),
          });
        }
      }
      const after = await transaction.memory.findUnique({
        where: { id: memoryId },
        select: revisionSnapshotSelect,
      });
      if (!after) throw resourceNotFound();
      await this.recordRevision(transaction, actor, before, after);
    });
    return this.detailForActor(actor, memoryId);
  }

  async remove(
    role: IdentityRole,
    memoryId: string,
    version?: number,
    ifMatch?: string,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    if (version === undefined && ifMatch === undefined) {
      throw preconditionRequired("version or If-Match is required");
    }
    await this.serializable(async (transaction) => {
      const before = await transaction.memory.findFirst({
        where: this.visibleWhere(actor, memoryId),
        select: revisionSnapshotSelect,
      });
      if (!before) throw resourceNotFound();
      const expectedVersion =
        version ?? this.versionFromEtag(memoryId, ifMatch!);
      this.assertEtag(memoryId, expectedVersion, ifMatch);
      const deletedAt = this.clock.now();
      const changed = await transaction.memory.updateMany({
        where: {
          ...this.visibleWhere(actor, memoryId),
          version: expectedVersion,
        },
        data: {
          status: MemoryStatus.ARCHIVED,
          deletedAt,
          updatedById: actor.user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await transaction.contentRevision.create({
        data: {
          coupleId: actor.couple.id,
          resourceType: "MEMORY",
          resourceId: memoryId,
          version: expectedVersion + 1,
          authorId: actor.user.id,
          changes: json({
            status: { from: before.status, to: MemoryStatus.ARCHIVED },
            deletedAt: { from: null, to: deletedAt.toISOString() },
          }),
        },
      });
    });
  }

  async revisions(
    role: IdentityRole,
    memoryId: string,
  ): Promise<MemoryRevision[]> {
    const actor = await this.identities.current(role);
    const exists = await this.prisma.memory.findFirst({
      where: this.visibleWhere(actor, memoryId),
      select: { id: true },
    });
    if (!exists) throw resourceNotFound();
    const revisions = await this.prisma.contentRevision.findMany({
      where: {
        coupleId: actor.couple.id,
        resourceType: "MEMORY",
        resourceId: memoryId,
      },
      orderBy: { version: "desc" },
      select: {
        version: true,
        authorId: true,
        changes: true,
        createdAt: true,
      },
    });
    return revisions.map((revision) =>
      toMemoryRevision(revision, actor.couple),
    );
  }

  async upsertPerspective(
    role: IdentityRole,
    memoryId: string,
    dto: UpsertPerspectiveDto,
  ): Promise<MemoryPerspectiveView> {
    const actor = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      await this.assertEditableMemory(transaction, actor, memoryId);
      const existing = await transaction.memoryPerspective.findUnique({
        where: {
          memoryId_authorId: { memoryId, authorId: actor.user.id },
        },
        select: { id: true, version: true },
      });
      if (!existing) {
        if (dto.version !== undefined) throw stateConflict();
        await transaction.memoryPerspective.create({
          data: {
            memoryId,
            authorId: actor.user.id,
            content: dto.content,
            mood: dto.mood === "" ? null : (dto.mood ?? null),
          },
        });
        return;
      }
      if (dto.version === undefined) {
        throw preconditionRequired(
          "version is required when updating an existing perspective",
        );
      }
      const changed = await transaction.memoryPerspective.updateMany({
        where: {
          id: existing.id,
          memoryId,
          authorId: actor.user.id,
          version: dto.version,
        },
        data: {
          content: dto.content,
          ...(dto.mood === undefined
            ? {}
            : { mood: dto.mood === "" ? null : dto.mood }),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
    });
    return this.currentPerspective(actor, memoryId);
  }

  async submitPerspective(
    role: IdentityRole,
    memoryId: string,
    dto: SubmitPerspectiveDto,
  ): Promise<MemoryPerspectiveView> {
    const actor = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      await this.assertEditableMemory(transaction, actor, memoryId);
      const changed = await transaction.memoryPerspective.updateMany({
        where: {
          memoryId,
          authorId: actor.user.id,
          version: dto.version,
        },
        data: {
          submittedAt: this.clock.now(),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        const exists = await transaction.memoryPerspective.findUnique({
          where: {
            memoryId_authorId: { memoryId, authorId: actor.user.id },
          },
          select: { id: true },
        });
        if (!exists) throw resourceNotFound();
        throw stateConflict();
      }
    });
    return this.currentPerspective(actor, memoryId);
  }

  async addComment(
    role: IdentityRole,
    memoryId: string,
    dto: CreateMemoryCommentDto,
  ): Promise<MemoryComment> {
    const actor = await this.identities.current(role);
    const comment = await this.serializable(async (transaction) => {
      await this.assertEditableMemory(transaction, actor, memoryId);
      return transaction.comment.create({
        data: {
          memoryId,
          authorId: actor.user.id,
          content: dto.content,
        },
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
    return {
      id: comment.id,
      content: comment.content,
      author: actor.user,
      canDelete: true,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  async removeComment(
    role: IdentityRole,
    memoryId: string,
    commentId: string,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      await this.assertVisibleMemory(transaction, actor, memoryId);
      const comment = await transaction.comment.findFirst({
        where: {
          id: commentId,
          memoryId,
          memory: { coupleId: actor.couple.id, deletedAt: null },
        },
        select: { authorId: true, deletedAt: true },
      });
      if (!comment) throw resourceNotFound();
      if (comment.authorId !== actor.user.id) throw actionForbidden();
      if (comment.deletedAt !== null) return;
      await transaction.comment.updateMany({
        where: {
          id: commentId,
          memoryId,
          authorId: actor.user.id,
          deletedAt: null,
        },
        data: { deletedAt: this.clock.now() },
      });
    });
  }

  async addReaction(
    role: IdentityRole,
    memoryId: string,
    emoji: string,
  ): Promise<ReactionSummary[]> {
    const actor = await this.identities.current(role);
    const normalized = this.validateEmoji(emoji);
    await this.assertVisibleMemory(this.prisma, actor, memoryId);
    await this.prisma.reaction.upsert({
      where: {
        authorId_targetType_targetId_emoji: {
          authorId: actor.user.id,
          targetType: ReactionTargetType.MEMORY,
          targetId: memoryId,
          emoji: normalized,
        },
      },
      create: {
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        targetType: ReactionTargetType.MEMORY,
        targetId: memoryId,
        emoji: normalized,
      },
      update: {},
    });
    return this.reactionSummaries(actor, memoryId);
  }

  async removeReaction(
    role: IdentityRole,
    memoryId: string,
    emoji: string,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const normalized = this.validateEmoji(emoji);
    await this.assertVisibleMemory(this.prisma, actor, memoryId);
    await this.prisma.reaction.deleteMany({
      where: {
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        targetType: ReactionTargetType.MEMORY,
        targetId: memoryId,
        emoji: normalized,
      },
    });
  }

  async bindMedia(
    role: IdentityRole,
    memoryId: string,
    dto: BindMemoryMediaDto,
    ifMatch?: string,
  ): Promise<MemoryDetail> {
    const actor = await this.identities.current(role);
    this.assertEtag(memoryId, dto.version, ifMatch);
    if (
      dto.coverMediaId !== undefined &&
      dto.coverMediaId !== null &&
      !dto.mediaIds.includes(dto.coverMediaId)
    ) {
      throw validationFailed("coverMediaId must be included in mediaIds");
    }
    await this.serializable(async (transaction) => {
      const before = await transaction.memory.findFirst({
        where: this.editableWhere(actor, memoryId),
        select: revisionSnapshotSelect,
      });
      if (!before) throw resourceNotFound();
      await this.assertMedia(transaction, actor.couple.id, dto.mediaIds);
      const nextCoverId =
        dto.coverMediaId === undefined
          ? before.coverMediaId !== null &&
            dto.mediaIds.includes(before.coverMediaId)
            ? before.coverMediaId
            : null
          : dto.coverMediaId;

      const changed = await transaction.memory.updateMany({
        where: {
          ...this.editableWhere(actor, memoryId),
          version: dto.version,
        },
        data: {
          coverMediaId: nextCoverId,
          updatedById: actor.user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();

      await transaction.memoryMedia.deleteMany({
        where: {
          memoryId,
          ...(dto.mediaIds.length === 0
            ? {}
            : { mediaAssetId: { notIn: dto.mediaIds } }),
        },
      });

      if (nextCoverId !== null) {
        await transaction.memoryMedia.updateMany({
          where: {
            memoryId,
            role: MemoryMediaRole.COVER,
            mediaAssetId: { not: nextCoverId },
          },
          data: { role: MemoryMediaRole.GALLERY },
        });
      } else {
        await transaction.memoryMedia.updateMany({
          where: { memoryId, role: MemoryMediaRole.COVER },
          data: { role: MemoryMediaRole.GALLERY },
        });
      }
      for (const [sortOrder, mediaAssetId] of dto.mediaIds.entries()) {
        const roleForAsset =
          mediaAssetId === nextCoverId
            ? MemoryMediaRole.COVER
            : MemoryMediaRole.GALLERY;
        await transaction.memoryMedia.upsert({
          where: { memoryId_mediaAssetId: { memoryId, mediaAssetId } },
          create: { memoryId, mediaAssetId, sortOrder, role: roleForAsset },
          update: { sortOrder, role: roleForAsset },
        });
      }
      const after = await transaction.memory.findUnique({
        where: { id: memoryId },
        select: revisionSnapshotSelect,
      });
      if (!after) throw resourceNotFound();
      await this.recordRevision(transaction, actor, before, after);
    });
    return this.detailForActor(actor, memoryId);
  }

  async unbindMedia(
    role: IdentityRole,
    memoryId: string,
    mediaId: string,
    version: number | undefined,
    ifMatch?: string,
  ): Promise<MemoryDetail> {
    const actor = await this.identities.current(role);
    if (version === undefined && ifMatch === undefined) {
      throw preconditionRequired("version or If-Match is required");
    }
    await this.serializable(async (transaction) => {
      const before = await transaction.memory.findFirst({
        where: this.editableWhere(actor, memoryId),
        select: revisionSnapshotSelect,
      });
      if (!before) throw resourceNotFound();
      const expectedVersion =
        version ?? this.versionFromEtag(memoryId, ifMatch!);
      this.assertEtag(memoryId, expectedVersion, ifMatch);
      if (!before.media.some((media) => media.mediaAssetId === mediaId)) {
        throw resourceNotFound();
      }
      const changed = await transaction.memory.updateMany({
        where: {
          ...this.editableWhere(actor, memoryId),
          version: expectedVersion,
        },
        data: {
          ...(before.coverMediaId === mediaId ? { coverMediaId: null } : {}),
          updatedById: actor.user.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await transaction.memoryMedia.delete({
        where: { memoryId_mediaAssetId: { memoryId, mediaAssetId: mediaId } },
      });
      const after = await transaction.memory.findUnique({
        where: { id: memoryId },
        select: revisionSnapshotSelect,
      });
      if (!after) throw resourceNotFound();
      await this.recordRevision(transaction, actor, before, after);
    });
    return this.detailForActor(actor, memoryId);
  }

  etag(memoryId: string, version: number): string {
    return `\"memory:${memoryId}:${version}\"`;
  }

  private async detailForActor(
    actor: IdentityResponse,
    memoryId: string,
  ): Promise<MemoryDetail> {
    const [memory, reactions] = await Promise.all([
      this.prisma.memory.findFirst({
        where: this.visibleWhere(actor, memoryId),
        select: {
          ...memoryDetailSelect,
          perspectives: {
            where: {
              OR: [{ authorId: actor.user.id }, { submittedAt: { not: null } }],
            },
            select: {
              authorId: true,
              content: true,
              mood: true,
              submittedAt: true,
              version: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.reaction.findMany({
        where: {
          coupleId: actor.couple.id,
          targetType: ReactionTargetType.MEMORY,
          targetId: memoryId,
        },
        select: { authorId: true, emoji: true },
      }),
    ]);
    if (!memory) throw resourceNotFound();
    return toMemoryDetail(
      memory as MemoryDetailRecord,
      actor.user.id,
      actor.couple,
      reactions,
    );
  }

  private async currentPerspective(
    actor: IdentityResponse,
    memoryId: string,
  ): Promise<MemoryPerspectiveView> {
    const detail = await this.detailForActor(actor, memoryId);
    const perspective = detail.perspectives.find(
      (candidate) => candidate.author.id === actor.user.id,
    );
    if (!perspective) throw resourceNotFound();
    return perspective;
  }

  private async reactionSummaries(
    actor: IdentityResponse,
    memoryId: string,
  ): Promise<ReactionSummary[]> {
    const reactions = await this.prisma.reaction.findMany({
      where: {
        coupleId: actor.couple.id,
        targetType: ReactionTargetType.MEMORY,
        targetId: memoryId,
      },
      select: { authorId: true, emoji: true },
    });
    return toReactionSummaries(reactions, actor.user.id);
  }

  private async reactionsFor(
    coupleId: string,
    memoryIds: string[],
  ): Promise<Map<string, ReactionRecord[]>> {
    if (memoryIds.length === 0) return new Map();
    const reactions = await this.prisma.reaction.findMany({
      where: {
        coupleId,
        targetType: ReactionTargetType.MEMORY,
        targetId: { in: memoryIds },
      },
      select: { targetId: true, authorId: true, emoji: true },
    });
    const grouped = new Map<string, ReactionRecord[]>();
    for (const reaction of reactions) {
      const group = grouped.get(reaction.targetId) ?? [];
      group.push(reaction);
      grouped.set(reaction.targetId, group);
    }
    return grouped;
  }

  private visibleWhere(
    actor: IdentityResponse,
    memoryId: string,
  ): Prisma.MemoryWhereInput {
    return {
      id: memoryId,
      coupleId: actor.couple.id,
      deletedAt: null,
      OR: [
        { status: MemoryStatus.PUBLISHED },
        { status: MemoryStatus.ARCHIVED },
        { status: MemoryStatus.DRAFT, createdById: actor.user.id },
      ],
    };
  }

  private editableWhere(
    actor: IdentityResponse,
    memoryId: string,
  ): Prisma.MemoryWhereInput {
    return {
      id: memoryId,
      coupleId: actor.couple.id,
      deletedAt: null,
      OR: [
        { status: MemoryStatus.PUBLISHED },
        { status: MemoryStatus.DRAFT, createdById: actor.user.id },
      ],
    };
  }

  private async assertVisibleMemory(
    database: Pick<Prisma.TransactionClient, "memory">,
    actor: IdentityResponse,
    memoryId: string,
  ): Promise<void> {
    const memory = await database.memory.findFirst({
      where: this.visibleWhere(actor, memoryId),
      select: { id: true },
    });
    if (!memory) throw resourceNotFound();
  }

  private async assertEditableMemory(
    database: Pick<Prisma.TransactionClient, "memory">,
    actor: IdentityResponse,
    memoryId: string,
  ): Promise<void> {
    const memory = await database.memory.findFirst({
      where: this.editableWhere(actor, memoryId),
      select: { id: true },
    });
    if (!memory) throw resourceNotFound();
  }

  private async assertPlace(
    transaction: Prisma.TransactionClient,
    coupleId: string,
    placeId: string | null | undefined,
  ): Promise<void> {
    if (placeId === undefined || placeId === null) return;
    const place = await transaction.place.findFirst({
      where: { id: placeId, coupleId, deletedAt: null },
      select: { id: true },
    });
    if (!place) throw resourceNotFound();
  }

  private async assertTags(
    transaction: Prisma.TransactionClient,
    coupleId: string,
    tagIds: string[],
  ): Promise<void> {
    if (tagIds.length === 0) return;
    const count = await transaction.tag.count({
      where: { id: { in: tagIds }, coupleId, deletedAt: null },
    });
    if (count !== tagIds.length) throw resourceNotFound();
  }

  private async assertMedia(
    transaction: Prisma.TransactionClient,
    coupleId: string,
    mediaIds: string[],
  ): Promise<void> {
    if (mediaIds.length === 0) return;
    const count = await transaction.mediaAsset.count({
      where: {
        id: { in: mediaIds },
        coupleId,
        status: MediaStatus.READY,
        deletedAt: null,
      },
    });
    if (count !== mediaIds.length) throw resourceNotFound();
  }

  private validateFirstTime(
    isFirstTime: boolean,
    firstTimeLabel: string | null,
  ): void {
    if (!isFirstTime && firstTimeLabel !== null) {
      throw validationFailed(
        "firstTimeLabel can only be set when isFirstTime is true",
      );
    }
  }

  private validateEmoji(value: string): string {
    const emoji = value.trim();
    const hasPictographic =
      /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(emoji);
    const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(emoji);
    if (
      emoji.length === 0 ||
      Array.from(emoji).length > 16 ||
      (!hasPictographic && !isKeycap) ||
      /[\p{Letter}\p{Separator}]/u.test(emoji)
    ) {
      throw validationFailed("emoji must be one valid short emoji sequence");
    }
    return emoji;
  }

  private assertEtag(
    memoryId: string,
    version: number,
    ifMatch: string | undefined,
  ): void {
    if (ifMatch === undefined) return;
    if (this.versionFromEtag(memoryId, ifMatch) !== version) {
      throw stateConflict();
    }
  }

  private versionFromEtag(memoryId: string, value: string): number {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) return Number(normalized);
    const match =
      normalized.match(/^\"memory:([^:\"]+):(\d+)\"$/) ??
      normalized.match(/^memory:([^:\"]+):(\d+)$/);
    if (!match || match[1] !== memoryId) throw stateConflict();
    const version = Number(match[2]);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw validationFailed("If-Match is invalid");
    }
    return version;
  }

  private async recordRevision(
    transaction: Prisma.TransactionClient,
    actor: IdentityResponse,
    before: RevisionSnapshot,
    after: RevisionSnapshot,
  ): Promise<void> {
    if (after.status === MemoryStatus.DRAFT) return;

    const changes =
      before.status === MemoryStatus.DRAFT
        ? initialChanges(snapshotValue(after))
        : changesBetween(snapshotValue(before), snapshotValue(after));
    await transaction.contentRevision.create({
      data: {
        coupleId: actor.couple.id,
        resourceType: "MEMORY",
        resourceId: after.id,
        version: after.version,
        authorId: actor.user.id,
        changes,
      },
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
