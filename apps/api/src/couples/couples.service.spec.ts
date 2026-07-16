import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { CouplesService } from "./couples.service";

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-16T08:30:00.000Z");
  }

  localDate(): string {
    return "2026-07-16";
  }
}

const identity = {
  role: "girl" as const,
  user: {
    id: "00000000-0000-4000-8000-000000000102",
    version: 1,
    displayName: "乙",
    slot: 2 as const,
    role: "girl" as const,
    nicknameInRelationship: "乙",
    avatarUrl: null,
  },
  couple: {
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: "今天也一起认真生活。",
    theme: "system" as const,
    members: [],
  },
};

function updatedCouple() {
  return {
    id: identity.couple.id,
    version: 2,
    name: identity.couple.name,
    startDate: new Date("2024-01-01T00:00:00.000Z"),
    timezone: "Asia/Shanghai",
    signature: "新的关系签名",
    theme: "system",
    members: [
      {
        slot: 1,
        nicknameInRelationship: "甲",
        user: {
          id: "00000000-0000-4000-8000-000000000101",
          version: 1,
          displayName: "甲",
        },
      },
      {
        slot: 2,
        nicknameInRelationship: "乙",
        user: {
          id: identity.user.id,
          version: 1,
          displayName: "乙",
        },
      },
    ],
  };
}

describe("CouplesService", () => {
  it("scopes an optimistic update to the selected fixed member", async () => {
    const transaction = {
      couple: {
        findFirst: vi.fn().mockResolvedValue({
          timezone: "Asia/Shanghai",
          startDate: new Date("2024-01-01T00:00:00.000Z"),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue(updatedCouple()),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity),
    } as unknown as IdentityService;
    const service = new CouplesService(prisma, identities, new FixedClock());

    const result = await service.update("girl", {
      version: 1,
      signature: "新的关系签名",
    });

    expect(transaction.couple.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: identity.couple.id,
          version: 1,
          members: {
            some: { userId: identity.user.id, status: "ACTIVE" },
          },
        }),
      }),
    );
    expect(result).toMatchObject({ version: 2, signature: "新的关系签名" });
    expect(
      transaction.couple.findUnique.mock.calls[0]![0].select.members.select.user
        .select,
    ).toEqual({ id: true, version: true, displayName: true });
  });
});
