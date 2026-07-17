import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  ApiException,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import {
  createPrivateNotification,
  enqueueOutboxEvent,
} from "../shared-events/persistent-event";
import type { PutTodayMoodDto } from "./dto/mood.dto";
import {
  moodEntrySelect,
  toMoodEntryView,
  type MonthlyMoodsResponse,
  type MoodEntryView,
} from "./mood.presentation";

type MonthRange = {
  start: Date;
  end: Date;
};

function preconditionRequired(message: string): ApiException {
  return new ApiException(
    HttpStatus.PRECONDITION_REQUIRED,
    "PRECONDITION_REQUIRED",
    message,
  );
}

function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationFailed("local date must be a real calendar date");
  }
  return date;
}

function monthRange(month: string): MonthRange {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw validationFailed("month must use YYYY-MM");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1900 || year > 2200) {
    throw validationFailed("month must use a supported calendar year");
  }
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { start, end };
}

@Injectable()
export class MoodsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async listMonth(
    role: IdentityRole,
    month: string,
  ): Promise<MonthlyMoodsResponse> {
    const actor = await this.identities.current(role);
    const range = monthRange(month);
    const memberIds = actor.couple.members.map((member) => member.id);
    const partnerIds = memberIds.filter(
      (memberId) => memberId !== actor.user.id,
    );
    const entries = await this.prisma.moodEntry.findMany({
      where: {
        coupleId: actor.couple.id,
        entryDate: { gte: range.start, lt: range.end },
        OR: [
          { authorId: actor.user.id },
          { authorId: { in: partnerIds }, visibleToPartner: true },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { authorId: "asc" }],
      select: moodEntrySelect,
    });
    const mine = entries.filter((entry) => entry.authorId === actor.user.id);
    const partner = entries.filter(
      (entry) =>
        entry.authorId !== actor.user.id && entry.visibleToPartner === true,
    );

    return {
      month,
      mine: mine.map((entry) => toMoodEntryView(entry, actor.couple)),
      partner: partner.map((entry) => toMoodEntryView(entry, actor.couple)),
    };
  }

  async putToday(
    role: IdentityRole,
    dto: PutTodayMoodDto,
  ): Promise<MoodEntryView> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const localDate = this.clock.localDate(actor.couple.timezone, now);
    const entryDate = dateOnly(localDate);
    const createdId = randomUUID();

    const result = await this.serializable(async (transaction) => {
      const existing = await transaction.moodEntry.findUnique({
        where: {
          coupleId_authorId_entryDate: {
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            entryDate,
          },
        },
        select: moodEntrySelect,
      });
      if (existing && dto.version === undefined) {
        throw preconditionRequired(
          "version is required when updating today's mood",
        );
      }
      if (
        (existing && dto.version !== existing.version) ||
        (!existing && dto.version !== undefined)
      ) {
        throw stateConflict(
          existing ? { currentVersion: existing.version } : undefined,
        );
      }

      const visibleToPartner =
        dto.visibleToPartner ?? existing?.visibleToPartner ?? true;
      const wantsResponse =
        dto.wantsResponse ?? existing?.wantsResponse ?? false;
      if (!visibleToPartner && wantsResponse) {
        throw validationFailed(
          "wantsResponse cannot be true while the mood is hidden",
        );
      }

      let entry;
      if (!existing) {
        entry = await transaction.moodEntry.create({
          data: {
            id: createdId,
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            entryDate,
            mood: dto.mood,
            note: dto.note === "" ? null : (dto.note ?? null),
            visibleToPartner,
            wantsResponse,
          },
          select: moodEntrySelect,
        });
      } else {
        const changed = await transaction.moodEntry.updateMany({
          where: {
            id: existing.id,
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            entryDate,
            version: existing.version,
          },
          data: {
            mood: dto.mood,
            ...(dto.note === undefined
              ? {}
              : { note: dto.note === "" ? null : dto.note }),
            ...(dto.visibleToPartner === undefined
              ? {}
              : { visibleToPartner: dto.visibleToPartner }),
            ...(dto.wantsResponse === undefined
              ? {}
              : { wantsResponse: dto.wantsResponse }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw stateConflict();
        const updated = await transaction.moodEntry.findUnique({
          where: { id: existing.id },
          select: moodEntrySelect,
        });
        if (!updated) throw resourceNotFound();
        entry = updated;
      }

      if (entry.visibleToPartner) {
        if (entry.wantsResponse) {
          await createPrivateNotification(transaction, {
            coupleId: actor.couple.id,
            recipientId: partner.id,
            type: "MOOD_RESPONSE_REQUESTED",
            dedupeKey: `mood-entry:${entry.id}:v${entry.version}:notification`,
            resourceType: "MOOD_ENTRY",
            resourceId: entry.id,
            title: "对方希望你回应今天的心情",
            body: "去看看对方今天留下的心情。",
          });
        }
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `mood-entry:${entry.id}:v${entry.version}:updated`,
          aggregateType: "MOOD_ENTRY",
          aggregateId: entry.id,
          eventType: "mood_entry.updated",
          actorId: actor.user.id,
          recipientId: partner.id,
          version: entry.version,
          occurredAt: now,
        });
      } else if (existing?.visibleToPartner) {
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `mood-entry:${entry.id}:v${entry.version}:hidden`,
          aggregateType: "MOOD_ENTRY",
          aggregateId: entry.id,
          eventType: "mood_entry.hidden",
          actorId: actor.user.id,
          recipientId: partner.id,
          version: entry.version,
          occurredAt: now,
        });
      }
      return entry;
    });

    return toMoodEntryView(result, actor.couple);
  }

  async removeToday(role: IdentityRole, version: number): Promise<void> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const entryDate = dateOnly(
      this.clock.localDate(actor.couple.timezone, now),
    );

    await this.serializable(async (transaction) => {
      const existing = await transaction.moodEntry.findUnique({
        where: {
          coupleId_authorId_entryDate: {
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            entryDate,
          },
        },
        select: { id: true, version: true, visibleToPartner: true },
      });
      if (!existing) throw resourceNotFound();
      if (existing.version !== version) {
        throw stateConflict({ currentVersion: existing.version });
      }

      const deleted = await transaction.moodEntry.deleteMany({
        where: {
          id: existing.id,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          entryDate,
          version,
        },
      });
      if (deleted.count !== 1) throw stateConflict();

      if (existing.visibleToPartner) {
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `mood-entry:${existing.id}:v${version}:deleted`,
          aggregateType: "MOOD_ENTRY",
          aggregateId: existing.id,
          eventType: "mood_entry.deleted",
          actorId: actor.user.id,
          recipientId: partner.id,
          version,
          occurredAt: now,
        });
      }
    });
  }

  private partner(actor: IdentityResponse) {
    const partner = actor.couple.members.find(
      (member) => member.id !== actor.user.id,
    );
    if (!partner) throw resourceNotFound();
    return partner;
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          if (attempt < 3) continue;
          throw stateConflict();
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
