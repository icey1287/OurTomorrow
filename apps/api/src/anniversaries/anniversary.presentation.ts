import {
  MediaStatus,
  type AnniversaryLeapDayRule,
  type AnniversaryRepeat,
  type AnniversaryType,
  type PlanStatus,
  Prisma,
} from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";
import {
  type MediaAssetRecord,
  type MediaAssetSummary,
  type MemoryCardSummary,
  type PlaceRecord,
  type PlaceSummary,
  toMediaAssetSummary,
  toPlaceSummary,
} from "../memories/memory.presentation";

export type AnniversaryReminderView = {
  id: string;
  daysBefore: number;
  minuteOfDay: number;
  enabled: boolean;
  nextRunAt: string | null;
};

export type PlanSummary = {
  id: string;
  version: number;
  title: string;
  itinerary: string | null;
  preparations: string[];
  participants: string[];
  expectation: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reminderAt: string | null;
  anniversaryOccurrenceDate: string | null;
  status: PlanStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  wishId: string | null;
  anniversaryId: string | null;
  place: PlaceSummary | null;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
};

export type AnniversarySummary = {
  id: string;
  version: number;
  title: string;
  type: AnniversaryType;
  date: string;
  repeat: AnniversaryRepeat;
  leapDayRule: AnniversaryLeapDayRule;
  nextOccurrenceLocalDate: string | null;
  nextOccurrenceAt: string | null;
  daysUntil: number | null;
  backgroundMedia: MediaAssetSummary | null;
  reminders: AnniversaryReminderView[];
  sourceNoteId: string | null;
  createdBy: UserSummary;
  createdAt: string;
  updatedAt: string;
};

export type AnniversaryDetail = AnniversarySummary & {
  plans: PlanSummary[];
  memories: MemoryCardSummary[];
};

export type AnniversaryOccurrence = {
  localDate: string;
  occursAt: string;
  daysUntil: number;
  memories: MemoryCardSummary[];
  plan: PlanSummary | null;
};

export const anniversaryReminderSelect =
  Prisma.validator<Prisma.AnniversaryReminderSelect>()({
    id: true,
    daysBefore: true,
    minuteOfDay: true,
    enabled: true,
    updatedAt: true,
  });

export const anniversaryMediaSelect =
  Prisma.validator<Prisma.MediaAssetSelect>()({
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

export const anniversarySelect = Prisma.validator<Prisma.AnniversarySelect>()({
  id: true,
  coupleId: true,
  title: true,
  type: true,
  date: true,
  repeat: true,
  leapDayRule: true,
  version: true,
  sourceNoteId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  backgroundMedia: { select: anniversaryMediaSelect },
  reminders: {
    orderBy: [{ daysBefore: "desc" }, { minuteOfDay: "asc" }, { id: "asc" }],
    select: anniversaryReminderSelect,
  },
});

const planPlaceSelect = Prisma.validator<Prisma.PlaceSelect>()({
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

export const anniversaryPlanSelect = Prisma.validator<Prisma.PlanSelect>()({
  id: true,
  version: true,
  title: true,
  itinerary: true,
  preparations: true,
  participants: true,
  expectation: true,
  startsAt: true,
  endsAt: true,
  reminderAt: true,
  anniversaryOccurrenceDate: true,
  status: true,
  completedAt: true,
  cancelledAt: true,
  wishId: true,
  anniversaryId: true,
  place: { select: planPlaceSelect },
  createdById: true,
  createdAt: true,
  updatedAt: true,
});

export type AnniversaryRecord = Prisma.AnniversaryGetPayload<{
  select: typeof anniversarySelect;
}>;
export type AnniversaryReminderRecord = Prisma.AnniversaryReminderGetPayload<{
  select: typeof anniversaryReminderSelect;
}>;
export type AnniversaryPlanRecord = Prisma.PlanGetPayload<{
  select: typeof anniversaryPlanSelect;
}>;

function member(couple: CoupleSummary, userId: string): UserSummary {
  const user = couple.members.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Anniversary references a non-member user");
  return user;
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function toReminderView(
  reminder: AnniversaryReminderRecord,
  nextRunAt: Date | null,
): AnniversaryReminderView {
  return {
    id: reminder.id,
    daysBefore: reminder.daysBefore,
    minuteOfDay: reminder.minuteOfDay,
    enabled: reminder.enabled,
    nextRunAt: nextRunAt?.toISOString() ?? null,
  };
}

export function toPlanSummary(
  plan: AnniversaryPlanRecord,
  couple: CoupleSummary,
): PlanSummary {
  const place = plan.place as PlaceRecord | null;
  return {
    id: plan.id,
    version: plan.version,
    title: plan.title,
    itinerary: plan.itinerary,
    preparations: stringArray(plan.preparations),
    participants: stringArray(plan.participants),
    expectation: plan.expectation,
    startsAt: plan.startsAt?.toISOString() ?? null,
    endsAt: plan.endsAt?.toISOString() ?? null,
    reminderAt: plan.reminderAt?.toISOString() ?? null,
    anniversaryOccurrenceDate:
      plan.anniversaryOccurrenceDate?.toISOString().slice(0, 10) ?? null,
    status: plan.status,
    completedAt: plan.completedAt?.toISOString() ?? null,
    cancelledAt: plan.cancelledAt?.toISOString() ?? null,
    wishId: plan.wishId,
    anniversaryId: plan.anniversaryId,
    place:
      place !== null && place.deletedAt === null ? toPlaceSummary(place) : null,
    createdBy: member(couple, plan.createdById),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function visibleBackground(
  background: MediaAssetRecord | null,
): MediaAssetSummary | null {
  return background?.status === MediaStatus.READY &&
    background.deletedAt === null
    ? toMediaAssetSummary(background)
    : null;
}

export function creator(couple: CoupleSummary, userId: string): UserSummary {
  return member(couple, userId);
}
