import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import { UsersService } from "./users.service";

const identity = {
  role: "boy" as const,
  user: {
    id: "00000000-0000-4000-8000-000000000101",
    version: 1,
    displayName: "甲",
    slot: 1 as const,
    role: "boy" as const,
    nicknameInRelationship: "甲",
    avatarUrl: null,
  },
  couple: {
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: null,
    theme: "system" as const,
    members: [],
  },
};

describe("UsersService", () => {
  it("updates only the selected fixed member with optimistic concurrency", async () => {
    const transaction = {
      user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      couple: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coupleMember: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({
          slot: 1,
          nicknameInRelationship: "小甲",
          user: {
            id: identity.user.id,
            version: 2,
            displayName: "新名字",
          },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity),
    } as unknown as IdentityService;
    const service = new UsersService(prisma, identities);

    const result = await service.updateMe("boy", {
      version: 1,
      displayName: "新名字",
      nicknameInRelationship: "小甲",
    });

    expect(transaction.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: identity.user.id, version: 1 }),
      }),
    );
    expect(result).toMatchObject({
      id: identity.user.id,
      version: 2,
      role: "boy",
      slot: 1,
    });
    expect(
      transaction.coupleMember.findFirst.mock.calls[0]![0].select.user.select,
    ).toEqual({
      id: true,
      version: true,
      displayName: true,
    });
  });
});
