import { describe, expect, it, vi } from "vitest";
import { AnniversariesService } from "../anniversaries/anniversaries.service";
import { CapsulesService } from "../capsules/capsules.service";
import { Clock } from "../common/clock/clock";
import { CouplesService } from "../couples/couples.service";
import { DailyEntriesService } from "../daily-entries/daily-entries.service";
import { MemoryResurfaceService } from "../memories/memory-resurface.service";
import { NotesService } from "../notes/notes.service";
import { PlansService } from "../plans/plans.service";
import { StatusesService } from "../statuses/statuses.service";
import { WishesService } from "../wishes/wishes.service";
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
    const memoryResurface = {
      random: vi.fn().mockResolvedValue(null),
    } as unknown as MemoryResurfaceService;
    const statuses = {
      current: vi.fn().mockResolvedValue({
        serverNow: "2026-07-16T08:30:00.000Z",
        mine: null,
        partner: null,
      }),
    } as unknown as StatusesService;
    const dailyEntryStatus = {
      date: "2026-07-16",
      timezone: "Asia/Shanghai",
      prompt: { id: "prompt-id", text: "今天什么时候想起了对方？" },
      status: "DRAFT",
      mine: null,
      partner: { submitted: false },
    };
    const dailyEntries = {
      today: vi.fn().mockResolvedValue(dailyEntryStatus),
    } as unknown as DailyEntriesService;
    const notes = {
      list: vi.fn().mockResolvedValue({
        serverNow: "2026-07-16T08:30:00.000Z",
        items: [],
      }),
    } as unknown as NotesService;
    const anniversaries = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as AnniversariesService;
    const wishes = {
      list: vi.fn().mockResolvedValue({ items: [], meta: {} }),
    } as unknown as WishesService;
    const plans = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as PlansService;
    const capsules = {
      list: vi.fn().mockResolvedValue([]),
    } as unknown as CapsulesService;
    const service = new TodayService(
      couples,
      new FixedClock(),
      memoryResurface,
      statuses,
      dailyEntries,
      notes,
      anniversaries,
      wishes,
      plans,
      capsules,
    );

    const result = await service.get("boy");

    expect(result).toMatchObject({
      serverNow: "2026-07-16T08:30:00.000Z",
      localDate: "2026-07-16",
      greeting: "下午好，慢慢走向共同的明天。",
      relationship: { daysTogether: 1034 },
      partnerStatus: null,
      latestNote: null,
      dailyEntryStatus,
      nextAnniversary: null,
      activeWish: null,
      randomMemory: null,
    });
    expect(memoryResurface.random).toHaveBeenCalledWith("boy");
    expect(statuses.current).toHaveBeenCalledWith("boy");
    expect(dailyEntries.today).toHaveBeenCalledWith("boy");
    expect(notes.list).toHaveBeenCalledWith("boy", { scope: "received" });
    expect(anniversaries.list).toHaveBeenCalledWith("boy");
    expect(wishes.list).toHaveBeenCalledTimes(3);
  });

  it("returns the nearest anniversary and prioritizes an in-progress wish", async () => {
    const relationship = {
      id: "couple-id",
      version: 1,
      name: "我们的明天",
      startDate: "2023-09-17",
      timezone: "Asia/Shanghai",
      signature: null,
      theme: "system",
      members: [],
    };
    const nextAnniversary = { id: "anniversary-next", daysUntil: 3 };
    const activeWish = {
      id: "wish-active",
      status: "IN_PROGRESS",
      updatedAt: "2026-07-16T08:00:00.000Z",
    };
    const service = new TodayService(
      {
        current: vi.fn().mockResolvedValue(relationship),
      } as unknown as CouplesService,
      new FixedClock(),
      {
        random: vi.fn().mockResolvedValue(null),
      } as unknown as MemoryResurfaceService,
      {
        current: vi.fn().mockResolvedValue({ mine: null, partner: null }),
      } as unknown as StatusesService,
      {
        today: vi.fn().mockResolvedValue({ status: "DRAFT" }),
      } as unknown as DailyEntriesService,
      {
        list: vi.fn().mockResolvedValue({ items: [] }),
      } as unknown as NotesService,
      {
        list: vi
          .fn()
          .mockResolvedValue([
            nextAnniversary,
            { id: "anniversary-past", daysUntil: null },
          ]),
      } as unknown as AnniversariesService,
      {
        list: vi.fn(async (_role, query) => ({
          items: query.status === "IN_PROGRESS" ? [activeWish] : [],
          meta: { hasMore: false, nextCursor: null },
        })),
      } as unknown as WishesService,
      { list: vi.fn().mockResolvedValue([]) } as unknown as PlansService,
      { list: vi.fn().mockResolvedValue([]) } as unknown as CapsulesService,
    );

    const result = await service.get("girl");

    expect(result.nextAnniversary).toBe(nextAnniversary);
    expect(result.activeWish).toBe(activeWish);
  });

  it("filters the upcoming window and strips all capsule body and media fields", async () => {
    const relationship = {
      id: "couple-id",
      version: 1,
      name: "我们的明天",
      startDate: "2023-09-17",
      timezone: "Asia/Shanghai",
      signature: null,
      theme: "system",
      members: [],
    };
    const safeCapsule = {
      id: "capsule-soon",
      version: 2,
      title: "七夕见",
      type: "JOINT",
      unlockRule: "AT_TIME",
      status: "LOCKED",
      unlockAt: "2026-07-20T00:00:00.000Z",
      dueAt: "2026-07-20T00:00:00.000Z",
      anniversaryId: null,
      wishId: null,
      requiresBothConfirmation: true,
      confirmedMemberIds: [],
      openedMemberIds: [],
      createdBy: { id: "boy-id" },
      sealedAt: "2026-07-16T00:00:00.000Z",
      unlockedAt: null,
      openedAt: null,
      convertedMemoryId: null,
      bodyAvailable: false,
      canEdit: false,
      canSeal: false,
      canConfirm: false,
      canOpen: false,
      canConvert: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
      unlockCondition: "绝不能泄露的条件",
      messages: [{ content: "绝不能泄露的正文" }],
      media: [{ originalName: "secret-photo.jpg" }],
    };
    const service = new TodayService(
      {
        current: vi.fn().mockResolvedValue(relationship),
      } as unknown as CouplesService,
      new FixedClock(),
      { random: vi.fn() } as unknown as MemoryResurfaceService,
      { current: vi.fn() } as unknown as StatusesService,
      { today: vi.fn() } as unknown as DailyEntriesService,
      { list: vi.fn() } as unknown as NotesService,
      {
        list: vi.fn().mockResolvedValue([
          { id: "anniversary-soon", daysUntil: 30 },
          { id: "anniversary-later", daysUntil: 31 },
        ]),
      } as unknown as AnniversariesService,
      { list: vi.fn() } as unknown as WishesService,
      {
        list: vi.fn().mockResolvedValue([
          {
            id: "plan-soon",
            status: "SCHEDULED",
            startsAt: "2026-07-20T00:00:00.000Z",
            endsAt: null,
          },
          {
            id: "plan-later",
            status: "SCHEDULED",
            startsAt: "2026-08-20T00:00:00.000Z",
            endsAt: null,
          },
        ]),
      } as unknown as PlansService,
      {
        list: vi.fn().mockResolvedValue([
          safeCapsule,
          {
            ...safeCapsule,
            id: "capsule-later",
            dueAt: "2026-08-20T00:00:00.000Z",
          },
        ]),
      } as unknown as CapsulesService,
    );

    const result = await service.upcoming("boy", 30);

    expect(result.anniversaries.map(({ id }) => id)).toEqual([
      "anniversary-soon",
    ]);
    expect(result.plans.map(({ id }) => id)).toEqual(["plan-soon"]);
    expect(result.capsules.map(({ id }) => id)).toEqual(["capsule-soon"]);
    expect(JSON.stringify(result.capsules)).not.toContain("绝不能泄露");
    expect(JSON.stringify(result.capsules)).not.toContain("secret-photo.jpg");
    expect(result.capsules[0]).not.toHaveProperty("messages");
    expect(result.capsules[0]).not.toHaveProperty("media");
    expect(result.capsules[0]).not.toHaveProperty("unlockCondition");
  });
});
