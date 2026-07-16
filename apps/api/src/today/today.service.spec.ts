import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { CouplesService } from "../couples/couples.service";
import { TodayService } from "./today.service";

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-16T08:30:00.000Z");
  }

  localDate(): string {
    return "2026-07-16";
  }
}

describe("TodayService", () => {
  it("derives the local relationship day from the server clock", async () => {
    const couples = {
      current: vi.fn().mockResolvedValue({
        id: "couple-id",
        version: 1,
        name: "我们的明天",
        startDate: "2023-09-17",
        timezone: "Asia/Shanghai",
        signature: null,
        theme: "system",
        members: [
          {
            id: "boy-id",
            version: 1,
            displayName: "甲",
            slot: 1,
            role: "boy",
            nicknameInRelationship: "甲",
            avatarUrl: null,
          },
          {
            id: "girl-id",
            version: 1,
            displayName: "乙",
            slot: 2,
            role: "girl",
            nicknameInRelationship: "乙",
            avatarUrl: null,
          },
        ],
      }),
    } as unknown as CouplesService;
    const service = new TodayService(couples, new FixedClock());

    const result = await service.get("boy");

    expect(result).toMatchObject({
      serverNow: "2026-07-16T08:30:00.000Z",
      localDate: "2026-07-16",
      greeting: "下午好，慢慢走向共同的明天。",
      relationship: { daysTogether: 1034 },
      partnerStatus: null,
      latestNote: null,
      activeWish: null,
    });
  });
});
