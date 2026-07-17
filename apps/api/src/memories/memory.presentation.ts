import {
  MediaStatus,
  type MemoryMediaRole,
  type MemoryStatus,
  type PlaceFutureState,
  type PlaceHistoryState,
  type PlaceStatus,
  type Prisma,
} from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";

export type TagSummary = {
  id: string;
  version: number;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaceSummary = {
  id: string;
  version: number;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  status: PlaceStatus;
  historyState: PlaceHistoryState;
  futureState: PlaceFutureState;
  firstVisitedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaAssetSummary = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
};

export type MemoryMediaView = {
  role: MemoryMediaRole;
  sortOrder: number;
  asset: MediaAssetSummary;
};

export type MemoryPerspectiveState = "EMPTY" | "DRAFT" | "SUBMITTED";

export type MemoryPerspectiveView = {
  author: UserSummary;
  state: MemoryPerspectiveState;
  editable: boolean;
  version?: number;
  content?: string;
  mood?: string | null;
  submittedAt?: string | null;
  updatedAt?: string;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type MemoryComment = {
  id: string;
  content: string;
  author: UserSummary;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemoryCardSummary = {
  id: string;
  version: number;
  title: string;
  excerpt: string | null;
  happenedAt: string;
  status: MemoryStatus;
  place: PlaceSummary | null;
  coverMedia: MediaAssetSummary | null;
  tags: TagSummary[];
  isFirstTime: boolean;
  firstTimeLabel: string | null;
  isPinned: boolean;
  perspectiveSubmittedCount: number;
  perspectivesComplete: boolean;
  commentCount: number;
  reactions: ReactionSummary[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryDetail = MemoryCardSummary & {
  content: string | null;
  mood: string | null;
  createdBy: UserSummary;
  updatedBy: UserSummary | null;
  media: MemoryMediaView[];
  perspectives: MemoryPerspectiveView[];
  comments: MemoryComment[];
};

export type MemoryRevision = {
  version: number;
  author: UserSummary;
  changes: Record<string, { from: unknown; to: unknown }>;
  createdAt: string;
};

type DecimalLike = { toNumber(): number };

export type PlaceRecord = {
  id: string;
  version: number;
  name: string;
  address: string | null;
  latitude: DecimalLike | null;
  longitude: DecimalLike | null;
  status: PlaceStatus;
  historyState: PlaceHistoryState;
  futureState: PlaceFutureState;
  firstVisitedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type TagRecord = {
  id: string;
  version: number;
  name: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export type MediaAssetRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  size: bigint;
  width: number | null;
  height: number | null;
  status: MediaStatus;
  createdAt: Date;
  deletedAt: Date | null;
};

export type PerspectiveRecord = {
  authorId: string;
  content: string;
  mood: string | null;
  submittedAt: Date | null;
  version: number;
  updatedAt: Date;
};

export type ReactionRecord = {
  authorId: string;
  emoji: string;
};

export type MemoryCardRecord = {
  id: string;
  version: number;
  title: string;
  content: string | null;
  happenedAt: Date;
  status: MemoryStatus;
  place: PlaceRecord | null;
  coverMedia: MediaAssetRecord | null;
  tags: Array<{ tag: TagRecord }>;
  isFirstTime: boolean;
  firstTimeLabel: string | null;
  isPinned: boolean;
  perspectives: Array<{ submittedAt: Date | null }>;
  _count: { comments: number };
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryDetailRecord = MemoryCardRecord & {
  mood: string | null;
  createdById: string;
  updatedById: string | null;
  media: Array<{
    role: MemoryMediaRole;
    sortOrder: number;
    mediaAsset: MediaAssetRecord;
  }>;
  perspectives: PerspectiveRecord[];
  comments: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error("Media size exceeds the safe JSON integer range");
  }
  return number;
}

function member(couple: CoupleSummary, userId: string): UserSummary {
  const result = couple.members.find((candidate) => candidate.id === userId);
  if (!result) throw new Error("Memory references a non-member user");
  return result;
}

function excerpt(content: string | null): string | null {
  if (content === null) return null;
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return null;
  return normalized.length > 180
    ? `${normalized.slice(0, 179).trimEnd()}…`
    : normalized;
}

export function toTagSummary(tag: TagRecord): TagSummary {
  return {
    id: tag.id,
    version: tag.version,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

export function toPlaceSummary(place: PlaceRecord): PlaceSummary {
  return {
    id: place.id,
    version: place.version,
    name: place.name,
    address: place.address,
    latitude: place.latitude?.toNumber() ?? null,
    longitude: place.longitude?.toNumber() ?? null,
    status: place.status,
    historyState: place.historyState,
    futureState: place.futureState,
    firstVisitedAt: place.firstVisitedAt?.toISOString() ?? null,
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

export function toMediaAssetSummary(
  asset: MediaAssetRecord,
): MediaAssetSummary {
  return {
    id: asset.id,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    size: safeNumber(asset.size),
    width: asset.width,
    height: asset.height,
    url: `/api/v1/media/${asset.id}`,
    thumbnailUrl: `/api/v1/media/${asset.id}/thumbnail`,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function toReactionSummaries(
  reactions: ReactionRecord[],
  actorId: string,
): ReactionSummary[] {
  const groups = new Map<string, ReactionSummary>();
  for (const reaction of reactions) {
    const existing = groups.get(reaction.emoji);
    if (existing) {
      existing.count += 1;
      if (reaction.authorId === actorId) existing.reactedByMe = true;
      continue;
    }
    groups.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: 1,
      reactedByMe: reaction.authorId === actorId,
    });
  }
  return [...groups.values()].sort((left, right) =>
    left.emoji.localeCompare(right.emoji),
  );
}

export function toMemoryCardSummary(
  memory: MemoryCardRecord,
  actorId: string,
  reactions: ReactionRecord[],
): MemoryCardSummary {
  const submittedCount = memory.perspectives.filter(
    (perspective) => perspective.submittedAt !== null,
  ).length;
  const visibleCover =
    memory.coverMedia?.status === MediaStatus.READY &&
    memory.coverMedia.deletedAt === null
      ? memory.coverMedia
      : null;
  const visiblePlace =
    memory.place && memory.place.deletedAt == null ? memory.place : null;

  return {
    id: memory.id,
    version: memory.version,
    title: memory.title,
    excerpt: excerpt(memory.content),
    happenedAt: memory.happenedAt.toISOString(),
    status: memory.status,
    place: visiblePlace ? toPlaceSummary(visiblePlace) : null,
    coverMedia: visibleCover ? toMediaAssetSummary(visibleCover) : null,
    tags: memory.tags
      .map(({ tag }) => tag)
      .filter((tag) => tag.deletedAt == null)
      .map(toTagSummary),
    isFirstTime: memory.isFirstTime,
    firstTimeLabel: memory.firstTimeLabel,
    isPinned: memory.isPinned,
    perspectiveSubmittedCount: submittedCount,
    perspectivesComplete: submittedCount === 2,
    commentCount: memory._count.comments,
    reactions: toReactionSummaries(reactions, actorId),
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

function perspectiveViews(
  perspectives: PerspectiveRecord[],
  actorId: string,
  couple: CoupleSummary,
): MemoryPerspectiveView[] {
  return couple.members.map((author) => {
    const perspective = perspectives.find(
      (candidate) => candidate.authorId === author.id,
    );
    if (!perspective) {
      return {
        author,
        state: "EMPTY",
        editable: author.id === actorId,
      };
    }
    if (perspective.submittedAt === null && author.id !== actorId) {
      return { author, state: "EMPTY", editable: false };
    }
    return {
      author,
      state: perspective.submittedAt === null ? "DRAFT" : "SUBMITTED",
      editable: author.id === actorId,
      version: perspective.version,
      content: perspective.content,
      mood: perspective.mood,
      submittedAt: perspective.submittedAt?.toISOString() ?? null,
      updatedAt: perspective.updatedAt.toISOString(),
    };
  });
}

export function toMemoryDetail(
  memory: MemoryDetailRecord,
  actorId: string,
  couple: CoupleSummary,
  reactions: ReactionRecord[],
): MemoryDetail {
  return {
    ...toMemoryCardSummary(memory, actorId, reactions),
    content: memory.content,
    mood: memory.mood,
    createdBy: member(couple, memory.createdById),
    updatedBy:
      memory.updatedById === null ? null : member(couple, memory.updatedById),
    media: memory.media
      .filter(
        ({ mediaAsset }) =>
          mediaAsset.status === MediaStatus.READY &&
          mediaAsset.deletedAt === null,
      )
      .map(({ role, sortOrder, mediaAsset }) => ({
        role,
        sortOrder,
        asset: toMediaAssetSummary(mediaAsset),
      })),
    perspectives: perspectiveViews(memory.perspectives, actorId, couple),
    comments: memory.comments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      author: member(couple, comment.authorId),
      canDelete: comment.authorId === actorId,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    })),
  };
}

export function toMemoryRevision(
  revision: {
    version: number;
    authorId: string;
    changes: Prisma.JsonValue;
    createdAt: Date;
  },
  couple: CoupleSummary,
): MemoryRevision {
  return {
    version: revision.version,
    author: member(couple, revision.authorId),
    changes: revision.changes as Record<string, { from: unknown; to: unknown }>,
    createdAt: revision.createdAt.toISOString(),
  };
}
