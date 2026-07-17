import { AnnualReviewStatus, MediaStatus, Prisma } from "@prisma/client";
import type { CoupleSummary } from "../common/presentation/relationship";
import type { IdentityRole } from "../identity/identity.constants";
import {
  toMediaAssetSummary,
  type MediaAssetSummary,
} from "../memories/memory.presentation";

const selectedMediaSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
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

export const annualReviewSelect = Prisma.validator<Prisma.AnnualReviewSelect>()(
  {
    id: true,
    coupleId: true,
    year: true,
    status: true,
    version: true,
    statistics: true,
    keywords: true,
    nextYearLetter: true,
    createdAt: true,
    updatedAt: true,
    publishedAt: true,
    contributions: {
      orderBy: { authorId: "asc" },
      select: {
        authorId: true,
        message: true,
        selectedMedia: { select: selectedMediaSelect },
      },
    },
  },
);

export type AnnualReviewRecord = Prisma.AnnualReviewGetPayload<{
  select: typeof annualReviewSelect;
}>;

export type AnnualReviewStatistics = {
  memories: number;
  places: number;
  completedWishes: number;
  photos: number;
};

export type AnnualReviewView = {
  id: string;
  year: number;
  status: AnnualReviewStatus;
  version: number;
  statistics: AnnualReviewStatistics;
  keywords: string[];
  nextYearLetter: string | null;
  contributions: Array<{
    role: IdentityRole;
    selectedMedia: MediaAssetSummary | null;
    message: string | null;
    editable: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function annualReviewStatistics(
  value: Prisma.JsonValue,
): AnnualReviewStatistics {
  const object =
    value !== null && !Array.isArray(value) && typeof value === "object"
      ? value
      : {};
  return {
    memories: nonNegativeInteger(object.memories),
    places: nonNegativeInteger(object.places),
    completedWishes: nonNegativeInteger(object.completedWishes),
    photos: nonNegativeInteger(object.photos),
  };
}

function keywordList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

export function toAnnualReviewView(
  review: AnnualReviewRecord,
  couple: CoupleSummary,
  currentUserId: string,
): AnnualReviewView {
  return {
    id: review.id,
    year: review.year,
    status: review.status,
    version: review.version,
    statistics: annualReviewStatistics(review.statistics),
    keywords: keywordList(review.keywords),
    nextYearLetter: review.nextYearLetter,
    contributions: review.contributions.map((contribution) => {
      const member = couple.members.find(
        (candidate) => candidate.id === contribution.authorId,
      );
      if (!member) throw new Error("Annual review references a non-member");
      const selectedMedia = contribution.selectedMedia;
      return {
        role: member.role,
        selectedMedia:
          selectedMedia?.status === MediaStatus.READY &&
          selectedMedia.deletedAt === null
            ? toMediaAssetSummary(selectedMedia)
            : null,
        message: contribution.message,
        editable:
          contribution.authorId === currentUserId &&
          review.status === AnnualReviewStatus.READY,
      };
    }),
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    publishedAt: review.publishedAt?.toISOString() ?? null,
  };
}
