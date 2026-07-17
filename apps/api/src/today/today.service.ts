import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../common/clock/clock";
import type { CoupleSummary } from "../common/presentation/relationship";
import { CouplesService } from "../couples/couples.service";
import {
  DailyEntriesService,
  type DailyEntryDetail,
} from "../daily-entries/daily-entries.service";
import type { IdentityRole } from "../identity/identity.constants";
import { type MemoryCardSummary } from "../memories/memory.presentation";
import { MemoryResurfaceService } from "../memories/memory-resurface.service";
import type { NoteView } from "../notes/note.presentation";
import { NotesService } from "../notes/notes.service";
import type { CurrentStatusView } from "../statuses/status.presentation";
import { StatusesService } from "../statuses/statuses.service";

export type TodayResponse = {
  serverNow: string;
  localDate: string;
  greeting: string;
  relationship: CoupleSummary & { daysTogether: number };
  partnerStatus: CurrentStatusView | null;
  latestNote: NoteView | null;
  dailyEntryStatus: DailyEntryDetail;
  nextAnniversary: null;
  randomMemory: MemoryCardSummary | null;
  activeWish: null;
};

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function localHour(timeZone: string, instant: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 0);
}

function greetingForHour(hour: number): string {
  if (hour < 5) return "夜深了，也要照顾好自己。";
  if (hour < 11) return "早上好，今天也一起认真生活。";
  if (hour < 14) return "中午好，记得好好吃饭。";
  if (hour < 18) return "下午好，慢慢走向共同的明天。";
  return "晚上好，欢迎回到你们的明天。";
}

@Injectable()
export class TodayService {
  constructor(
    @Inject(CouplesService)
    private readonly couples: CouplesService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MemoryResurfaceService)
    private readonly memoryResurface: MemoryResurfaceService,
    @Inject(StatusesService)
    private readonly statuses: StatusesService,
    @Inject(DailyEntriesService)
    private readonly dailyEntries: DailyEntriesService,
    @Inject(NotesService)
    private readonly notes: NotesService,
  ) {}

  async get(role: IdentityRole): Promise<TodayResponse> {
    const relationship = await this.couples.current(role);
    const now = this.clock.now();
    const localDate = this.clock.localDate(relationship.timezone, now);
    const elapsedDays = Math.floor(
      (dateOrdinal(localDate) - dateOrdinal(relationship.startDate)) /
        86_400_000,
    );
    const [randomMemory, statuses, dailyEntryStatus, receivedNotes] =
      await Promise.all([
        this.memoryResurface.random(role),
        this.statuses.current(role),
        this.dailyEntries.today(role),
        this.notes.list(role, { scope: "received" }),
      ]);
    const latestNote =
      receivedNotes.items
        .filter(
          (note) =>
            !note.isPlaceholder &&
            (note.status === "VISIBLE" || note.status === "VIEWED"),
        )
        .sort((left, right) =>
          left.isPlaceholder || right.isPlaceholder
            ? 0
            : right.createdAt.localeCompare(left.createdAt),
        )[0] ?? null;
    return {
      serverNow: now.toISOString(),
      localDate,
      greeting: greetingForHour(localHour(relationship.timezone, now)),
      relationship: {
        ...relationship,
        daysTogether: Math.max(1, elapsedDays + 1),
      },
      partnerStatus: statuses.partner,
      latestNote,
      dailyEntryStatus,
      nextAnniversary: null,
      randomMemory,
      activeWish: null,
    };
  }

  randomMemory(
    role: IdentityRole,
    excludeId?: string,
  ): Promise<MemoryCardSummary | null> {
    return this.memoryResurface.random(role, excludeId);
  }
}
