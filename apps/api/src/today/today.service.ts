import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../common/clock/clock";
import type { CoupleSummary } from "../common/presentation/relationship";
import { CouplesService } from "../couples/couples.service";
import type { IdentityRole } from "../identity/identity.constants";

export type TodayResponse = {
  serverNow: string;
  localDate: string;
  greeting: string;
  relationship: CoupleSummary & { daysTogether: number };
  partnerStatus: null;
  latestNote: null;
  dailyEntryStatus: null;
  nextAnniversary: null;
  randomMemory: null;
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
  ) {}

  async get(role: IdentityRole): Promise<TodayResponse> {
    const relationship = await this.couples.current(role);
    const now = this.clock.now();
    const localDate = this.clock.localDate(relationship.timezone, now);
    const elapsedDays = Math.floor(
      (dateOrdinal(localDate) - dateOrdinal(relationship.startDate)) /
        86_400_000,
    );
    return {
      serverNow: now.toISOString(),
      localDate,
      greeting: greetingForHour(localHour(relationship.timezone, now)),
      relationship: {
        ...relationship,
        daysTogether: Math.max(1, elapsedDays + 1),
      },
      partnerStatus: null,
      latestNote: null,
      dailyEntryStatus: null,
      nextAnniversary: null,
      randomMemory: null,
      activeWish: null,
    };
  }
}
