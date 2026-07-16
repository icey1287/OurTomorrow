import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service";
import {
  FIXED_BOY_USER_ID,
  FIXED_COUPLE_ID,
  FIXED_GIRL_USER_ID,
} from "./identity.constants";
import { IdentityService } from "./identity.service";

function fixedCouple() {
  return {
    id: FIXED_COUPLE_ID,
    version: 1,
    name: "我们的明天",
    startDate: new Date("2024-01-01T00:00:00.000Z"),
    timezone: "Asia/Shanghai",
    signature: "今天也一起认真生活。",
    theme: "system",
    members: [
      {
        slot: 1,
        nicknameInRelationship: "甲",
        user: {
          id: FIXED_BOY_USER_ID,
          version: 1,
          displayName: "甲",
        },
      },
      {
        slot: 2,
        nicknameInRelationship: "乙",
        user: {
          id: FIXED_GIRL_USER_ID,
          version: 1,
          displayName: "乙",
        },
      },
    ],
  };
}

describe("IdentityService", () => {
  it("creates both fixed members once and returns the selected role", async () => {
    const transaction = {
      user: { upsert: vi.fn().mockResolvedValue({}) },
      couple: { upsert: vi.fn().mockResolvedValue({}) },
      coupleMember: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
      couple: { findFirst: vi.fn().mockResolvedValue(fixedCouple()) },
    } as unknown as PrismaService;
    const service = new IdentityService(prisma);

    const result = await service.select("girl");

    expect(transaction.user.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.coupleMember.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.user.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: FIXED_BOY_USER_ID },
        create: expect.objectContaining({
          id: FIXED_BOY_USER_ID,
          username: "boy",
          displayName: "甲",
        }),
        update: {},
        select: { id: true },
      }),
    );
    expect(transaction.couple.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FIXED_COUPLE_ID },
        create: expect.objectContaining({
          id: FIXED_COUPLE_ID,
          name: "我们的明天",
          timezone: "Asia/Shanghai",
          signature: "今天也一起认真生活。",
        }),
        update: {},
        select: { id: true },
      }),
    );
    expect(result).toMatchObject({
      role: "girl",
      user: { id: FIXED_GIRL_USER_ID, role: "girl", slot: 2 },
      couple: {
        id: FIXED_COUPLE_ID,
        members: [
          expect.objectContaining({ role: "boy", slot: 1 }),
          expect.objectContaining({ role: "girl", slot: 2 }),
        ],
      },
    });
  });

  it("queries only presentation fields and never loads user secrets", async () => {
    const findFirst = vi.fn().mockResolvedValue(fixedCouple());
    const service = new IdentityService({
      couple: { findFirst },
    } as unknown as PrismaService);

    await service.current("boy");

    const query = findFirst.mock.calls[0]![0];
    expect(query.select.members.select.user.select).toEqual({
      id: true,
      version: true,
      displayName: true,
    });
  });
});
