import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { PlacesService } from "./places.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const PLACE_ID = "60000000-0000-4000-8000-000000000001";

const actor = {
  role: "boy" as const,
  user: { id: BOY_ID },
  couple: { id: COUPLE_ID },
};

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
    );

    await expect(
      service.create("boy", { name: "西湖", latitude: 30.25 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 400,
    );
    expect(create).not.toHaveBeenCalled();
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
});
