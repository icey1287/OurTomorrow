import { Prisma, type PlanStatus } from "@prisma/client";
import type {
  CoupleSummary,
  UserSummary,
} from "../common/presentation/relationship";
import {
  toPlaceSummary,
  type PlaceSummary,
} from "../memories/memory.presentation";

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

export const planSelect = Prisma.validator<Prisma.PlanSelect>()({
  id: true,
  coupleId: true,
  wishId: true,
  anniversaryId: true,
  placeId: true,
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
  version: true,
  completedAt: true,
  cancelledAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  place: {
    select: {
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
    },
  },
});

export type PlanRecord = Prisma.PlanGetPayload<{
  select: typeof planSelect;
}>;

function stringArray(value: Prisma.JsonValue, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Plan ${field} must be stored as a string array`);
  }
  return value.map((item) => item as string);
}

function member(couple: CoupleSummary, userId: string): UserSummary {
  const user = couple.members.find((candidate) => candidate.id === userId);
  if (!user) throw new Error("Plan references a non-member user");
  return user;
}

export function toPlanSummary(
  plan: PlanRecord,
  couple: CoupleSummary,
): PlanSummary {
  return {
    id: plan.id,
    version: plan.version,
    title: plan.title,
    itinerary: plan.itinerary,
    preparations: stringArray(plan.preparations, "preparations"),
    participants: stringArray(plan.participants, "participants"),
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
      plan.place === null || plan.place.deletedAt !== null
        ? null
        : toPlaceSummary(plan.place),
    createdBy: member(couple, plan.createdById),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
