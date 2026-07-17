import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { TagsService } from "./tags.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const TAG_ID = "40000000-0000-4000-8000-000000000001";

const actor = {
  role: "boy" as const,
  user: { id: BOY_ID },
  couple: { id: COUPLE_ID },
};

function tag(deletedAt: Date | null, version = 1) {
  const instant = new Date("2026-07-16T08:00:00.000Z");
  return {
    id: TAG_ID,
    version,
    name: "Ｔｒｉｐ",
    normalizedName: "trip",
    color: "#d97757",
    createdAt: instant,
    updatedAt: instant,
    deletedAt,
  };
}

describe("TagsService", () => {
  it("restores a same-space soft-deleted normalized tag instead of duplicating it", async () => {
    const transaction = {
      tag: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(tag(new Date("2026-07-15T00:00:00.000Z")))
          .mockResolvedValueOnce(tag(null, 2)),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new TagsService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
    );

    const result = await service.create("boy", {
      name: "Ｔｒｉｐ",
      color: "#d97757",
    });

    expect(transaction.tag.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          coupleId_normalizedName: {
            coupleId: COUPLE_ID,
            normalizedName: "trip",
          },
        },
      }),
    );
    expect(transaction.tag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: TAG_ID,
          coupleId: COUPLE_ID,
          deletedAt: { not: null },
        }),
        data: expect.objectContaining({
          deletedAt: null,
          version: { increment: 1 },
        }),
      }),
    );
    expect(result.version).toBe(2);
  });

  it("always scopes tag listing to the selected couple", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new TagsService(
      { tag: { findMany } } as unknown as PrismaService,
      {
        current: vi.fn().mockResolvedValue(actor),
      } as unknown as IdentityService,
    );

    await service.list("boy");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coupleId: COUPLE_ID, deletedAt: null },
      }),
    );
  });
});
