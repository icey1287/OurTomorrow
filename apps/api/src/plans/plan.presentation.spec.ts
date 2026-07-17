import { PlanStatus, PlaceStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { CoupleSummary } from "../common/presentation/relationship";
import { toPlanSummary, type PlanRecord } from "./plan.presentation";

const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const NOW = new Date("2026-07-17T08:00:00.000Z");

const couple: CoupleSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  name: "我们的明天",
  startDate: "2024-01-01",
  timezone: "Asia/Shanghai",
  signature: null,
  theme: "system",
  members: [
    {
      id: BOY_ID,
      version: 1,
      displayName: "甲",
      slot: 1,
      role: "boy",
      nicknameInRelationship: null,
      avatarUrl: null,
    },
    {
      id: GIRL_ID,
      version: 1,
      displayName: "乙",
      slot: 2,
      role: "girl",
      nicknameInRelationship: null,
      avatarUrl: null,
    },
  ],
};

function record(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    coupleId: couple.id,
    wishId: "41000000-0000-4000-8000-000000000001",
    anniversaryId: "42000000-0000-4000-8000-000000000001",
    placeId: "43000000-0000-4000-8000-000000000001",
    title: "去看海",
    itinerary: "沿海散步",
    preparations: ["带相机"],
    participants: ["我们"],
    expectation: "一起看日落",
    startsAt: new Date("2026-01-01T02:00:00.000Z"),
    endsAt: new Date("2026-01-01T06:00:00.000Z"),
    reminderAt: new Date("2026-08-16T02:00:00.000Z"),
    anniversaryOccurrenceDate: new Date("2026-01-01T00:00:00.000Z"),
    status: PlanStatus.SCHEDULED,
    version: 3,
    completedAt: null,
    cancelledAt: null,
    createdById: BOY_ID,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    place: {
      id: "43000000-0000-4000-8000-000000000001",
      version: 2,
      name: "海边",
      address: null,
      latitude: { toNumber: () => 31.2 } as never,
      longitude: { toNumber: () => 121.5 } as never,
      status: PlaceStatus.PLANNED,
      historyState: "UNVISITED",
      futureState: "PLANNED",
      firstVisitedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    },
    ...overrides,
  };
}

describe("toPlanSummary", () => {
  it("matches the shared plan contract including date-only occurrences", () => {
    expect(toPlanSummary(record(), couple)).toEqual({
      id: "40000000-0000-4000-8000-000000000001",
      version: 3,
      title: "去看海",
      itinerary: "沿海散步",
      preparations: ["带相机"],
      participants: ["我们"],
      expectation: "一起看日落",
      startsAt: "2026-01-01T02:00:00.000Z",
      endsAt: "2026-01-01T06:00:00.000Z",
      reminderAt: "2026-08-16T02:00:00.000Z",
      anniversaryOccurrenceDate: "2026-01-01",
      status: PlanStatus.SCHEDULED,
      completedAt: null,
      cancelledAt: null,
      wishId: "41000000-0000-4000-8000-000000000001",
      anniversaryId: "42000000-0000-4000-8000-000000000001",
      place: expect.objectContaining({
        id: "43000000-0000-4000-8000-000000000001",
        latitude: 31.2,
        longitude: 121.5,
      }),
      createdBy: couple.members[0],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it("fails closed when JSON list fields are malformed", () => {
    expect(() =>
      toPlanSummary(record({ preparations: { item: "相机" } }), couple),
    ).toThrow("Plan preparations must be stored as a string array");
  });
});
