import {
  PlaceFutureState,
  PlanStatus,
  Prisma,
  WishStatus,
} from "@prisma/client";
import { stateConflict } from "../common/http/api-exception";
import {
  activeFutureStateForAssociations,
  completePlaceState,
  reopenPlaceState,
  type PlaceStateSnapshot,
} from "./place-state";

type PlaceLifecycleDatabase = Pick<
  Prisma.TransactionClient,
  "place" | "plan" | "wish"
>;

type LifecycleInput = {
  coupleId: string;
  placeIds: readonly (string | null | undefined)[];
};

type ReopenInput = LifecycleInput & {
  excludedWishIds?: readonly string[];
  excludedPlanIds?: readonly string[];
};

const ACTIVE_WISH_STATUSES = [
  WishStatus.IDEA,
  WishStatus.PLANNED,
  WishStatus.IN_PROGRESS,
] as const;
const ACTIVE_PLAN_STATUSES = [
  PlanStatus.DRAFT,
  PlanStatus.SCHEDULED,
  PlanStatus.IN_PROGRESS,
] as const;

function uniquePlaceIds(
  placeIds: readonly (string | null | undefined)[],
): string[] {
  return [...new Set(placeIds.filter((id): id is string => Boolean(id)))];
}

async function competingFutureState(
  database: PlaceLifecycleDatabase,
  coupleId: string,
  placeId: string,
  exclusions: Pick<ReopenInput, "excludedWishIds" | "excludedPlanIds"> = {},
): Promise<PlaceFutureState> {
  const [wishes, plans] = await Promise.all([
    database.wish.findMany({
      where: {
        coupleId,
        placeId,
        deletedAt: null,
        status: { in: [...ACTIVE_WISH_STATUSES] },
        ...(exclusions.excludedWishIds?.length
          ? { id: { notIn: [...exclusions.excludedWishIds] } }
          : {}),
      },
      select: { status: true },
    }),
    database.plan.findMany({
      where: {
        coupleId,
        placeId,
        deletedAt: null,
        status: { in: [...ACTIVE_PLAN_STATUSES] },
        ...(exclusions.excludedPlanIds?.length
          ? { id: { notIn: [...exclusions.excludedPlanIds] } }
          : {}),
      },
      select: { status: true },
    }),
  ]);
  return activeFutureStateForAssociations({
    wishes: wishes.map(({ status }) => status),
    plans: plans.map(({ status }) => status),
  });
}

async function updatePlaceState(
  database: PlaceLifecycleDatabase,
  coupleId: string,
  placeId: string,
  transition: (
    current: PlaceStateSnapshot,
    competing: PlaceFutureState,
  ) => PlaceStateSnapshot,
  exclusions?: Pick<ReopenInput, "excludedWishIds" | "excludedPlanIds">,
): Promise<void> {
  const place = await database.place.findFirst({
    where: { id: placeId, coupleId, deletedAt: null },
    select: {
      version: true,
      status: true,
      historyState: true,
      futureState: true,
      firstVisitedAt: true,
    },
  });
  if (!place) return;
  const competing = await competingFutureState(
    database,
    coupleId,
    placeId,
    exclusions,
  );
  const next = transition(place, competing);
  const changed = await database.place.updateMany({
    where: {
      id: placeId,
      coupleId,
      deletedAt: null,
      version: place.version,
    },
    data: {
      status: next.status,
      historyState: next.historyState,
      futureState: next.futureState,
      firstVisitedAt: next.firstVisitedAt,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw stateConflict();
}

export async function completeLinkedPlaces(
  database: PlaceLifecycleDatabase,
  input: LifecycleInput & { completedAt: Date },
): Promise<void> {
  for (const placeId of uniquePlaceIds(input.placeIds)) {
    await updatePlaceState(
      database,
      input.coupleId,
      placeId,
      (current, competing) =>
        completePlaceState(current, input.completedAt, competing),
    );
  }
}

export async function reopenLinkedPlaces(
  database: PlaceLifecycleDatabase,
  input: ReopenInput,
): Promise<void> {
  for (const placeId of uniquePlaceIds(input.placeIds)) {
    await updatePlaceState(
      database,
      input.coupleId,
      placeId,
      reopenPlaceState,
      input,
    );
  }
}
