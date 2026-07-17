import { describe, expect, it, vi } from "vitest";
import { completeLinkedPlaces, reopenLinkedPlaces } from "./place-lifecycle";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const PLACE_ID = "10000000-0000-4000-8000-000000000001";
const WISH_ID = "20000000-0000-4000-8000-000000000001";
const PLAN_ID = "30000000-0000-4000-8000-000000000001";
const FIRST_VISIT = new Date("2025-01-01T08:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-17T08:00:00.000Z");

function database() {
  return {
    place: {
      findFirst: vi.fn().mockResolvedValue({
        version: 3,
        status: "PLANNED",
        historyState: "UNVISITED",
        futureState: "PLANNED",
        firstVisitedAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    wish: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    plan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("linked place lifecycle", () => {
  it("keeps the strongest remaining future association after completion", async () => {
    const transaction = database();
    transaction.wish.findMany.mockResolvedValue([{ status: "IDEA" }]);
    transaction.plan.findMany.mockResolvedValue([{ status: "IN_PROGRESS" }]);

    await completeLinkedPlaces(transaction as never, {
      coupleId: COUPLE_ID,
      placeIds: [PLACE_ID, PLACE_ID, null],
      completedAt: COMPLETED_AT,
    });

    expect(transaction.place.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction.wish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          placeId: PLACE_ID,
          deletedAt: null,
        }),
      }),
    );
    expect(transaction.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEPARTING",
          historyState: "VISITED",
          futureState: "DEPARTING",
          firstVisitedAt: COMPLETED_AT,
        }),
      }),
    );
  });

  it("excludes the reopened wish and plan while preserving visit history", async () => {
    const transaction = database();
    transaction.place.findFirst.mockResolvedValue({
      version: 4,
      status: "COMPLETED",
      historyState: "VISITED",
      futureState: "COMPLETED",
      firstVisitedAt: FIRST_VISIT,
    });

    await reopenLinkedPlaces(transaction as never, {
      coupleId: COUPLE_ID,
      placeIds: [PLACE_ID],
      excludedWishIds: [WISH_ID],
      excludedPlanIds: [PLAN_ID],
    });

    expect(transaction.wish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: [WISH_ID] } }),
      }),
    );
    expect(transaction.plan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: [PLAN_ID] } }),
      }),
    );
    expect(transaction.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PLANNED",
          historyState: "VISITED",
          futureState: "PLANNED",
          firstVisitedAt: FIRST_VISIT,
        }),
      }),
    );
  });
});
