import { Inject, Injectable } from "@nestjs/common";
import type { AnniversarySummary } from "../anniversaries/anniversary.presentation";
import { AnniversariesService } from "../anniversaries/anniversaries.service";
import type { CapsuleSummary } from "../capsules/capsule.presentation";
import { CapsulesService } from "../capsules/capsules.service";
import { Clock } from "../common/clock/clock";
import type { CoupleSummary } from "../common/presentation/relationship";
import {
  instantToPlainDate,
  plainDateStartInstant,
} from "../common/time/calendar";
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
import type { PlanSummary } from "../plans/plan.presentation";
import { PlansService } from "../plans/plans.service";
import type { CurrentStatusView } from "../statuses/status.presentation";
import { StatusesService } from "../statuses/statuses.service";
import type { WishSummary } from "../wishes/wish.presentation";
import { WishesService } from "../wishes/wishes.service";

export type TodayResponse = {
  serverNow: string;
  localDate: string;
  greeting: string;
  relationship: CoupleSummary & { daysTogether: number };
  partnerStatus: CurrentStatusView | null;
  latestNote: NoteView | null;
  dailyEntryStatus: DailyEntryDetail;
  nextAnniversary: AnniversarySummary | null;
  randomMemory: MemoryCardSummary | null;
  activeWish: WishSummary | null;
};

export type TodayUpcomingResponse = {
  serverNow: string;
  days: number;
  anniversaries: AnniversarySummary[];
  plans: PlanSummary[];
  capsules: CapsuleSummary[];
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
  return "晚上好，欢迎回到我们的明天。";
}

function safeCapsuleSummary(capsule: CapsuleSummary): CapsuleSummary {
  return {
    id: capsule.id,
    version: capsule.version,
    title: capsule.title,
    type: capsule.type,
    unlockRule: capsule.unlockRule,
    status: capsule.status,
    unlockAt: capsule.unlockAt,
    dueAt: capsule.dueAt,
    anniversaryId: capsule.anniversaryId,
    wishId: capsule.wishId,
    requiresBothConfirmation: capsule.requiresBothConfirmation,
    confirmedMemberIds: [...capsule.confirmedMemberIds],
    openedMemberIds: [...capsule.openedMemberIds],
    createdBy: capsule.createdBy,
    sealedAt: capsule.sealedAt,
    unlockedAt: capsule.unlockedAt,
    openedAt: capsule.openedAt,
    convertedMemoryId: capsule.convertedMemoryId,
    bodyAvailable: capsule.bodyAvailable,
    canEdit: capsule.canEdit,
    canSeal: capsule.canSeal,
    canConfirm: capsule.canConfirm,
    canOpen: capsule.canOpen,
    canConvert: capsule.canConvert,
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt,
  };
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
    @Inject(AnniversariesService)
    private readonly anniversaries: AnniversariesService,
    @Inject(WishesService)
    private readonly wishes: WishesService,
    @Inject(PlansService)
    private readonly plans: PlansService,
    @Inject(CapsulesService)
    private readonly capsules: CapsulesService,
  ) {}

  async get(role: IdentityRole): Promise<TodayResponse> {
    const relationship = await this.couples.current(role);
    const now = this.clock.now();
    const localDate = this.clock.localDate(relationship.timezone, now);
    const elapsedDays = Math.floor(
      (dateOrdinal(localDate) - dateOrdinal(relationship.startDate)) /
        86_400_000,
    );
    const [
      randomMemory,
      statuses,
      dailyEntryStatus,
      receivedNotes,
      nextAnniversary,
      activeWish,
    ] = await Promise.all([
      this.memoryResurface.random(role),
      this.statuses.current(role),
      this.dailyEntries.today(role),
      this.notes.list(role, { scope: "received" }),
      this.nextAnniversary(role),
      this.activeWish(role),
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
      nextAnniversary,
      randomMemory,
      activeWish,
    };
  }

  async upcoming(
    role: IdentityRole,
    days: number,
  ): Promise<TodayUpcomingResponse> {
    const relationship = await this.couples.current(role);
    const now = this.clock.now();
    const today = instantToPlainDate(now, relationship.timezone);
    const endExclusive = new Date(
      plainDateStartInstant(
        today.add({ days: days + 1 }),
        relationship.timezone,
      ).epochMilliseconds,
    );
    const [anniversaries, plans, capsules] = await Promise.all([
      this.anniversaries.list(role),
      this.plans.list(role, {}),
      this.capsules.list(role),
    ]);

    return {
      serverNow: now.toISOString(),
      days,
      anniversaries: anniversaries.filter(
        ({ daysUntil }) =>
          daysUntil !== null && daysUntil >= 0 && daysUntil <= days,
      ),
      plans: plans
        .filter((plan) => {
          const startsAt = plan.startsAt ? new Date(plan.startsAt) : null;
          const endsAt = plan.endsAt ? new Date(plan.endsAt) : null;
          if (plan.status === "SCHEDULED") {
            return (
              startsAt !== null && startsAt >= now && startsAt < endExclusive
            );
          }
          if (plan.status !== "IN_PROGRESS") return false;
          return (
            (startsAt === null || startsAt < endExclusive) &&
            (endsAt === null || endsAt >= now)
          );
        })
        .sort(
          (left, right) =>
            (left.startsAt ?? "").localeCompare(right.startsAt ?? "") ||
            left.id.localeCompare(right.id),
        ),
      capsules: capsules
        .filter((capsule) => {
          if (capsule.dueAt === null) return false;
          const dueAt = new Date(capsule.dueAt);
          return dueAt >= now && dueAt < endExclusive;
        })
        .sort(
          (left, right) =>
            left.dueAt!.localeCompare(right.dueAt!) ||
            left.id.localeCompare(right.id),
        )
        .map(safeCapsuleSummary),
    };
  }

  randomMemory(
    role: IdentityRole,
    excludeId?: string,
  ): Promise<MemoryCardSummary | null> {
    return this.memoryResurface.random(role, excludeId);
  }

  private async nextAnniversary(
    role: IdentityRole,
  ): Promise<AnniversarySummary | null> {
    const anniversaries = await this.anniversaries.list(role);
    return anniversaries.find(({ daysUntil }) => daysUntil !== null) ?? null;
  }

  private async activeWish(role: IdentityRole): Promise<WishSummary | null> {
    const statuses = ["IN_PROGRESS", "PLANNED", "IDEA"] as const;
    const pages = await Promise.all(
      statuses.map((status) => this.wishes.list(role, { limit: 1, status })),
    );
    for (const page of pages) {
      const wish = page.items[0];
      if (wish) return wish;
    }
    return null;
  }
}
