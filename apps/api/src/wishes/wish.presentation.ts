import {
  MediaStatus,
  Prisma,
  type WishCategory,
  type WishStatus,
} from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";
import {
  toMediaAssetSummary,
  toPlaceSummary,
  type MediaAssetSummary,
  type PlaceSummary,
} from "../memories/memory.presentation";
import {
  planSelect,
  toPlanSummary,
  type PlanRecord,
  type PlanSummary,
} from "../plans/plan.presentation";

const wishPlaceSelect = Prisma.validator<Prisma.PlaceSelect>()({
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

const wishMediaAssetSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
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

export const wishSummarySelect = Prisma.validator<Prisma.WishSelect>()({
  id: true,
  coupleId: true,
  title: true,
  description: true,
  expectation: true,
  category: true,
  status: true,
  version: true,
  placeId: true,
  plannedFor: true,
  completedAt: true,
  completionNote: true,
  completedById: true,
  sourceNoteId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  place: { select: wishPlaceSelect },
  media: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      sortOrder: true,
      mediaAsset: { select: wishMediaAssetSelect },
    },
  },
  plan: { select: planSelect },
  convertedMemory: { select: { id: true, deletedAt: true } },
});

export const wishDetailSelect = Prisma.validator<Prisma.WishSelect>()({
  ...wishSummarySelect,
  updates: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      authorId: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
    },
  },
});

export type WishUpdateView = {
  id: string;
  author: UserSummary;
  fromStatus: WishStatus | null;
  toStatus: WishStatus | null;
  note: string | null;
  createdAt: string;
};

export type WishSummary = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  expectation: string | null;
  category: WishCategory;
  status: WishStatus;
  place: PlaceSummary | null;
  plannedFor: string | null;
  completedAt: string | null;
  completionNote: string | null;
  createdBy: UserSummary;
  completedBy: UserSummary | null;
  media: MediaAssetSummary[];
  plan: PlanSummary | null;
  convertedMemoryId: string | null;
  sourceNoteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WishDetail = WishSummary & { updates: WishUpdateView[] };

export type WishSummaryRecord = Prisma.WishGetPayload<{
  select: typeof wishSummarySelect;
}>;

export type WishDetailRecord = Prisma.WishGetPayload<{
  select: typeof wishDetailSelect;
}>;

export type WishUpdateRecord = WishDetailRecord["updates"][number];

function member(couple: CoupleSummary, userId: string): UserSummary {
  const user = couple.members.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Wish references a non-member user");
  return user;
}

export function toWishUpdateView(
  update: WishUpdateRecord,
  couple: CoupleSummary,
): WishUpdateView {
  return {
    id: update.id,
    author: member(couple, update.authorId),
    fromStatus: update.fromStatus,
    toStatus: update.toStatus,
    note: update.note,
    createdAt: update.createdAt.toISOString(),
  };
}

export function toWishSummary(
  wish: WishSummaryRecord,
  couple: CoupleSummary,
): WishSummary {
  const visibleMedia = wish.media
    .map(({ mediaAsset }) => mediaAsset)
    .filter(
      (asset) => asset.status === MediaStatus.READY && asset.deletedAt === null,
    );
  const visiblePlace =
    wish.place !== null && wish.place.deletedAt === null ? wish.place : null;
  const visiblePlan =
    wish.plan !== null && wish.plan.deletedAt === null ? wish.plan : null;

  return {
    id: wish.id,
    version: wish.version,
    title: wish.title,
    description: wish.description,
    expectation: wish.expectation,
    category: wish.category,
    status: wish.status,
    place: visiblePlace ? toPlaceSummary(visiblePlace) : null,
    plannedFor: wish.plannedFor?.toISOString() ?? null,
    completedAt: wish.completedAt?.toISOString() ?? null,
    completionNote: wish.completionNote,
    createdBy: member(couple, wish.createdById),
    completedBy:
      wish.completedById === null ? null : member(couple, wish.completedById),
    media: visibleMedia.map(toMediaAssetSummary),
    plan: visiblePlan ? toPlanSummary(visiblePlan as PlanRecord, couple) : null,
    convertedMemoryId:
      wish.convertedMemory?.deletedAt === null ? wish.convertedMemory.id : null,
    sourceNoteId: wish.sourceNoteId,
    createdAt: wish.createdAt.toISOString(),
    updatedAt: wish.updatedAt.toISOString(),
  };
}

export function toWishDetail(
  wish: WishDetailRecord,
  couple: CoupleSummary,
): WishDetail {
  return {
    ...toWishSummary(wish, couple),
    updates: wish.updates.map((update) => toWishUpdateView(update, couple)),
  };
}
