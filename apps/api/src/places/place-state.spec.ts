import {
  PlaceFutureState,
  PlaceHistoryState,
  PlaceStatus,
  PlanStatus,
  WishStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  activeFutureStateForAssociations,
  completePlaceState,
  dimensionsForLegacyPlaceStatus,
  patchPlaceState,
  reopenPlaceState,
  resolvePlaceStateInput,
  type PlaceStateSnapshot,
} from "./place-state";

const FIRST_VISIT = new Date("2025-05-01T08:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-17T08:00:00.000Z");

function state(
  overrides: Partial<PlaceStateSnapshot> = {},
): PlaceStateSnapshot {
  return {
    status: PlaceStatus.WANT_TO_GO,
    historyState: PlaceHistoryState.UNVISITED,
    futureState: PlaceFutureState.WANT_TO_GO,
    firstVisitedAt: null,
    ...overrides,
  };
}

describe("place state transitions", () => {
  it("maps every legacy status onto the two independent dimensions", () => {
    expect(dimensionsForLegacyPlaceStatus(PlaceStatus.FIRST_TIME)).toEqual({
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.NONE,
    });
    expect(dimensionsForLegacyPlaceStatus(PlaceStatus.PLANNED)).toEqual({
      historyState: PlaceHistoryState.UNVISITED,
      futureState: PlaceFutureState.PLANNED,
    });
    expect(dimensionsForLegacyPlaceStatus(PlaceStatus.COMPLETED)).toEqual({
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.COMPLETED,
    });
  });

  it("keeps an old status verbatim unless a new dimension overrides it", () => {
    expect(
      resolvePlaceStateInput(state(), { status: PlaceStatus.FIRST_TIME }),
    ).toMatchObject({
      status: PlaceStatus.FIRST_TIME,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.NONE,
    });
    expect(
      resolvePlaceStateInput(state(), {
        status: PlaceStatus.FIRST_TIME,
        futureState: PlaceFutureState.PLANNED,
      }),
    ).toMatchObject({
      status: PlaceStatus.PLANNED,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.PLANNED,
    });
  });

  it("marks completion as history and records the first visit only once", () => {
    expect(completePlaceState(state(), COMPLETED_AT)).toEqual({
      status: PlaceStatus.COMPLETED,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.COMPLETED,
      firstVisitedAt: COMPLETED_AT,
    });
    expect(
      completePlaceState(
        state({
          historyState: PlaceHistoryState.LIVED,
          firstVisitedAt: FIRST_VISIT,
        }),
        COMPLETED_AT,
      ),
    ).toMatchObject({
      historyState: PlaceHistoryState.LIVED,
      firstVisitedAt: FIRST_VISIT,
    });
  });

  it("does not remove a place from the future when another active link remains", () => {
    const competing = activeFutureStateForAssociations({
      wishes: [WishStatus.IDEA],
      plans: [PlanStatus.IN_PROGRESS],
    });
    expect(competing).toBe(PlaceFutureState.DEPARTING);
    expect(completePlaceState(state(), COMPLETED_AT, competing)).toMatchObject({
      status: PlaceStatus.DEPARTING,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.DEPARTING,
    });
  });

  it("reopens to at least planned without erasing historical facts", () => {
    expect(
      reopenPlaceState(
        state({
          status: PlaceStatus.COMPLETED,
          historyState: PlaceHistoryState.VISITED,
          futureState: PlaceFutureState.COMPLETED,
          firstVisitedAt: FIRST_VISIT,
        }),
      ),
    ).toEqual({
      status: PlaceStatus.PLANNED,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.PLANNED,
      firstVisitedAt: FIRST_VISIT,
    });
  });

  it("treats a manual completed patch as a first visit on server time", () => {
    expect(
      patchPlaceState(
        state(),
        { futureState: PlaceFutureState.COMPLETED },
        COMPLETED_AT,
      ),
    ).toEqual({
      status: PlaceStatus.COMPLETED,
      historyState: PlaceHistoryState.VISITED,
      futureState: PlaceFutureState.COMPLETED,
      firstVisitedAt: COMPLETED_AT,
    });
  });
});
