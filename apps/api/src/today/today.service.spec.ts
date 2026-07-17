import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { CouplesService } from "../couples/couples.service";
import { DailyEntriesService } from "../daily-entries/daily-entries.service";
import { MemoryResurfaceService } from "../memories/memory-resurface.service";
import { NotesService } from "../notes/notes.service";
import { StatusesService } from "../statuses/statuses.service";
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
    const service = new TodayService(
      couples,
      new FixedClock(),
      memoryResurface,
      statuses,
      dailyEntries,
      notes,
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
      activeWish: null,
      randomMemory: null,
    });
    expect(memoryResurface.random).toHaveBeenCalledWith("boy");
    expect(statuses.current).toHaveBeenCalledWith("boy");
    expect(dailyEntries.today).toHaveBeenCalledWith("boy");
    expect(notes.list).toHaveBeenCalledWith("boy", { scope: "received" });
  });
});
