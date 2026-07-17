import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import type { Clock } from "../common/clock/clock";
import { PlacesService } from "./places.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const PLACE_ID = "60000000-0000-4000-8000-000000000001";

const actor = {
  role: "boy" as const,
  user: { id: BOY_ID },
  couple: { id: COUPLE_ID },
};

const clock = {
  now: vi.fn(() => new Date("2026-07-17T08:00:00.000Z")),
  localDate: vi.fn(() => "2026-07-17"),
} as unknown as Clock;

function place(version = 2) {
  const instant = new Date("2026-07-16T08:00:00.000Z");
  return {
    id: PLACE_ID,
    version,
    name: "西湖",
    address: "杭州",
    latitude: { toNumber: () => 30.25 },
    longitude: { toNumber: () => 120.15 },
    status: "VISITED" as const,
    historyState: "VISITED" as const,
    futureState: "NONE" as const,
    firstVisitedAt: instant,
    createdAt: instant,
    updatedAt: instant,
    deletedAt: null,
  };
}

describe("PlacesService", () => {
  it("rejects a partial coordinate pair before writing a place", async () => {
    const create = vi.fn();
    const service = new PlacesService(
      { place: { create } } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    await expect(
      service.create("boy", { name: "西湖", latitude: 30.25 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 400,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps a legacy future status synchronized with both new dimensions", async () => {
    const create = vi.fn().mockResolvedValue({
      ...place(1),
      status: "PLANNED",
      historyState: "UNVISITED",
      futureState: "PLANNED",
      firstVisitedAt: null,
    });
    const service = new PlacesService(
      { place: { create } } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    await service.create("boy", { name: "冰岛", status: "PLANNED" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PLANNED",
          historyState: "UNVISITED",
          futureState: "PLANNED",
        }),
      }),
    );
  });

  it("uses couple scope and optimistic version when updating a place", async () => {
    const transaction = {
      place: {
        findFirst: vi.fn().mockResolvedValue({
          latitude: { toNumber: () => 30.2 },
          longitude: { toNumber: () => 120.1 },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(place(3)),
      },
    };
    const service = new PlacesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    const result = await service.update("boy", PLACE_ID, {
      version: 2,
      name: "杭州西湖",
    });

    expect(transaction.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: PLACE_ID,
          coupleId: COUPLE_ID,
          deletedAt: null,
          version: 2,
        },
      }),
    );
    expect(result).toMatchObject({ version: 3, latitude: 30.25 });
  });

  it("returns a couple-scoped map and only requests memories visible to the actor", async () => {
    const instant = new Date("2026-07-16T08:00:00.000Z");
    const findManyPlaces = vi.fn().mockResolvedValue([
      {
        ...place(),
        memories: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            title: "一起看荷花",
            happenedAt: instant,
            coverMediaId: "80000000-0000-4000-8000-000000000001",
          },
        ],
        wishes: [
          {
            id: "90000000-0000-4000-8000-000000000001",
            title: "再去一次",
            status: "PLANNED",
            plannedFor: instant,
          },
        ],
        plans: [],
      },
    ]);
    const findManyMedia = vi.fn().mockResolvedValue([
      {
        id: "80000000-0000-4000-8000-000000000001",
        originalName: "lotus.jpg",
        mimeType: "image/jpeg",
        size: 1024n,
        width: 1200,
        height: 800,
        status: "READY",
        createdAt: instant,
        deletedAt: null,
      },
    ]);
    const service = new PlacesService(
      {
        place: { findMany: findManyPlaces },
        mediaAsset: { findMany: findManyMedia },
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    const result = await service.map("boy");

    expect(findManyPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coupleId: COUPLE_ID, deletedAt: null },
        select: expect.objectContaining({
          memories: expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([
                { status: "DRAFT", createdById: BOY_ID },
              ]),
            }),
          }),
        }),
      }),
    );
    expect(result.history[0]).toMatchObject({
      id: PLACE_ID,
      memories: [
        {
          title: "一起看荷花",
          coverMedia: { id: "80000000-0000-4000-8000-000000000001" },
        },
      ],
    });
    expect(result.future).toEqual([]);
    expect(result.withoutCoordinates).toEqual([]);
  });

  it("persists the canonical first visit when a regular update completes a place", async () => {
    const transaction = {
      place: {
        findFirst: vi.fn().mockResolvedValue({
          ...place(2),
          status: "PLANNED",
          historyState: "UNVISITED",
          futureState: "PLANNED",
          firstVisitedAt: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          ...place(3),
          status: "COMPLETED",
          historyState: "VISITED",
          futureState: "COMPLETED",
          firstVisitedAt: clock.now(),
        }),
      },
    };
    const service = new PlacesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    await service.update("boy", PLACE_ID, {
      version: 2,
      futureState: "COMPLETED",
      firstVisitedAt: null,
    });

    expect(transaction.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          historyState: "VISITED",
          futureState: "COMPLETED",
          firstVisitedAt: clock.now(),
        }),
      }),
    );
  });

  it("updates the dual status with the caller's optimistic version", async () => {
    const transaction = {
      place: {
        findFirst: vi.fn().mockResolvedValue(place(2)),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          ...place(3),
          status: "COMPLETED",
          historyState: "VISITED",
          futureState: "COMPLETED",
        }),
      },
    };
    const service = new PlacesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
      clock,
    );

    await service.updateStatus("boy", PLACE_ID, {
      version: 2,
      futureState: "COMPLETED",
    });

    expect(transaction.place.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 2, coupleId: COUPLE_ID }),
        data: expect.objectContaining({
          status: "COMPLETED",
          historyState: "VISITED",
          futureState: "COMPLETED",
          version: { increment: 1 },
        }),
      }),
    );
  });
});
