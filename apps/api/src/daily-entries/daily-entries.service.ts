import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { DailyEntryStatus, Prisma } from "@prisma/client";
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
import type {
  AddDailyEntryPostscriptDto,
  SaveDailyEntryDto,
  SubmitDailyEntryDto,
} from "./dto/daily-entry.dto";

export const DAILY_PROMPT_QUESTIONS = [
  "今天什么时候想起了对方？",
  "今天最开心的一件事是什么？",
  "今天有没有什么小委屈？",
  "今天最想感谢对方什么？",
  "今天希望对方怎样陪伴自己？",
  "今天想和未来的我们说什么？",
  "今天有什么很小、但想让对方知道的事？",
  "如果给今天留一张照片，你会拍什么？",
  "今天哪一刻让你感到安心？",
  "明天最想和对方一起完成什么小事？",
  "今天想认真夸夸对方什么？",
  "此刻最想对对方说的一句话是什么？",
] as const;

const promptSelect = Prisma.validator<Prisma.DailyPromptSelect>()({
  id: true,
  promptDate: true,
  question: true,
});

const ownEntrySelect = Prisma.validator<Prisma.DailyEntrySelect>()({
  id: true,
  content: true,
  postscript: true,
  status: true,
  version: true,
  submittedAt: true,
  revealedAt: true,
});

const entryMetadataSelect = Prisma.validator<Prisma.DailyEntrySelect>()({
  id: true,
  authorId: true,
  status: true,
  version: true,
  submittedAt: true,
  revealedAt: true,
});

const revealedPartnerSelect = Prisma.validator<Prisma.DailyEntrySelect>()({
  content: true,
  postscript: true,
  submittedAt: true,
  revealedAt: true,
});

type DailyPromptRecord = Prisma.DailyPromptGetPayload<{
  select: typeof promptSelect;
}>;

type OwnEntryRecord = Prisma.DailyEntryGetPayload<{
  select: typeof ownEntrySelect;
}>;

type EntryMetadata = Prisma.DailyEntryGetPayload<{
  select: typeof entryMetadataSelect;
}>;

type DailyPromptDatabase = Pick<Prisma.TransactionClient, "dailyPrompt">;

export type DailyEntryDetail = {
  date: string;
  timezone: string;
  prompt: {
    id: string;
    text: string;
  };
  status: DailyEntryStatus;
  mine: null | {
    answer: string;
    postscript: string | null;
    status: DailyEntryStatus;
    version: number;
    submittedAt: string | null;
    revealedAt: string | null;
  };
  partner:
    | { submitted: boolean }
    | {
        submitted: true;
        answer: string;
        postscript: string | null;
        submittedAt: string;
        revealedAt: string;
      };
};

export type DailyEntryCalendar = {
  month: string;
  timezone: string;
  days: Array<{
    date: string;
    status: DailyEntryStatus;
    mineSubmitted: boolean;
    partnerSubmitted: boolean;
    revealed: boolean;
  }>;
};

const DAY_MILLISECONDS = 86_400_000;
const EDITABLE_STATUSES = [
  DailyEntryStatus.DRAFT,
  DailyEntryStatus.EDITING,
] as const;
const WAITING_STATUSES = [
  DailyEntryStatus.SUBMITTED,
  DailyEntryStatus.WAITING_FOR_PARTNER,
  DailyEntryStatus.BOTH_SUBMITTED,
] as const;

function parseLocalDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationFailed("date must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationFailed("date must be a valid calendar date");
  }
  return date;
}

function parseMonth(value: string): { start: Date; end: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw validationFailed("month must use YYYY-MM");
  }
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = parseLocalDate(`${value}-01`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = parseLocalDate(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  );
  return { start, end };
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function instantString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function isSubmitted(status: DailyEntryStatus | undefined): boolean {
  return (
    status === DailyEntryStatus.SUBMITTED ||
    status === DailyEntryStatus.WAITING_FOR_PARTNER ||
    status === DailyEntryStatus.BOTH_SUBMITTED ||
    status === DailyEntryStatus.REVEALED
  );
}

function contentLocked(): ApiException {
  return new ApiException(
    HttpStatus.LOCKED,
    "CONTENT_LOCKED",
    "The revealed daily entry answer cannot be edited",
  );
}

function stateTransitionInvalid(message: string): ApiException {
  return new ApiException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    "STATE_TRANSITION_INVALID",
    message,
  );
}

function aggregateStatus(
  mine: Pick<OwnEntryRecord, "status"> | EntryMetadata | null | undefined,
  revealed: boolean,
): DailyEntryStatus {
  if (revealed) return DailyEntryStatus.REVEALED;
  if (!mine) return DailyEntryStatus.DRAFT;
  if (mine.status === DailyEntryStatus.SUBMITTED) {
    return DailyEntryStatus.WAITING_FOR_PARTNER;
  }
  return mine.status;
}

@Injectable()
export class DailyEntriesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async today(role: IdentityRole): Promise<DailyEntryDetail> {
    const actor = await this.identities.current(role);
    const localDate = this.clock.localDate(
      actor.couple.timezone,
      this.clock.now(),
    );
    return this.readDate(actor, localDate);
  }

  async byDate(
    role: IdentityRole,
    localDate: string,
  ): Promise<DailyEntryDetail> {
    const actor = await this.identities.current(role);
    parseLocalDate(localDate);
    return this.readDate(actor, localDate);
  }

  async saveToday(
    role: IdentityRole,
    dto: SaveDailyEntryDto,
  ): Promise<DailyEntryDetail> {
    const actor = await this.identities.current(role);
    const localDate = this.clock.localDate(
      actor.couple.timezone,
      this.clock.now(),
    );
    const entryDate = parseLocalDate(localDate);

    await this.serializable(async (transaction) => {
      const prompt = await this.ensurePrompt(
        actor.couple.id,
        localDate,
        transaction,
      );
      const existing = await transaction.dailyEntry.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          entryDate,
        },
        select: entryMetadataSelect,
      });

      if (!existing) {
        if (dto.version !== undefined) throw stateConflict();
        await transaction.dailyEntry.create({
          data: {
            coupleId: actor.couple.id,
            promptId: prompt.id,
            authorId: actor.user.id,
            entryDate,
            content: dto.answer,
            status:
              dto.answer.trim().length === 0
                ? DailyEntryStatus.DRAFT
                : DailyEntryStatus.EDITING,
          },
          select: { id: true },
        });
        return;
      }

      if (existing.status === DailyEntryStatus.REVEALED) {
        throw contentLocked();
      }
      if (
        !(EDITABLE_STATUSES as readonly DailyEntryStatus[]).includes(
          existing.status,
        )
      ) {
        throw stateTransitionInvalid(
          "A submitted daily entry cannot be edited",
        );
      }
      if (dto.version === undefined || dto.version !== existing.version) {
        throw stateConflict();
      }
      const updated = await transaction.dailyEntry.updateMany({
        where: {
          id: existing.id,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          version: dto.version,
          status: { in: [...EDITABLE_STATUSES] },
        },
        data: {
          content: dto.answer,
          status:
            dto.answer.trim().length === 0
              ? DailyEntryStatus.DRAFT
              : DailyEntryStatus.EDITING,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw stateConflict();
    });

    return this.readDate(actor, localDate);
  }

  async submitToday(
    role: IdentityRole,
    dto: SubmitDailyEntryDto,
  ): Promise<DailyEntryDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const localDate = this.clock.localDate(actor.couple.timezone, now);
    const entryDate = parseLocalDate(localDate);
    const partnerId = this.partnerId(actor);

    await this.serializable(async (transaction) => {
      const prompt = await this.ensurePrompt(
        actor.couple.id,
        localDate,
        transaction,
      );
      const own = await transaction.dailyEntry.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          entryDate,
        },
        select: ownEntrySelect,
      });
      if (!own) {
        throw stateTransitionInvalid("Save an answer before submitting it");
      }
      if (own.version !== dto.version) throw stateConflict();
      if (own.status === DailyEntryStatus.REVEALED) throw contentLocked();
      if (
        !(EDITABLE_STATUSES as readonly DailyEntryStatus[]).includes(own.status)
      ) {
        throw stateTransitionInvalid(
          "The daily entry has already been submitted",
        );
      }
      if (own.content.trim().length === 0) {
        throw validationFailed("answer must not be empty when submitted");
      }

      // Deliberately metadata-only. A partner's answer is not loaded until both
      // rows have committed the REVEALED state.
      const partner = await transaction.dailyEntry.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: partnerId,
          entryDate,
        },
        select: entryMetadataSelect,
      });

      if (partner?.status === DailyEntryStatus.REVEALED) {
        throw stateConflict();
      }

      if (!partner || !isSubmitted(partner.status)) {
        const submitted = await transaction.dailyEntry.updateMany({
          where: {
            id: own.id,
            coupleId: actor.couple.id,
            authorId: actor.user.id,
            version: dto.version,
            status: { in: [...EDITABLE_STATUSES] },
          },
          data: {
            status: DailyEntryStatus.WAITING_FOR_PARTNER,
            submittedAt: now,
            version: { increment: 1 },
          },
        });
        if (submitted.count !== 1) throw stateConflict();
        return;
      }

      const revealedPartner = await transaction.dailyEntry.updateMany({
        where: {
          id: partner.id,
          coupleId: actor.couple.id,
          authorId: partnerId,
          version: partner.version,
          status: { in: [...WAITING_STATUSES] },
        },
        data: {
          status: DailyEntryStatus.REVEALED,
          revealedAt: now,
          lockedAt: now,
          version: { increment: 1 },
        },
      });
      if (revealedPartner.count !== 1) throw stateConflict();

      const revealedOwn = await transaction.dailyEntry.updateMany({
        where: {
          id: own.id,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          version: dto.version,
          status: { in: [...EDITABLE_STATUSES] },
        },
        data: {
          status: DailyEntryStatus.REVEALED,
          submittedAt: now,
          revealedAt: now,
          lockedAt: now,
          version: { increment: 1 },
        },
      });
      if (revealedOwn.count !== 1) throw stateConflict();

      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: partnerId,
        type: "DAILY_ENTRY_REVEALED",
        resourceType: "DailyPrompt",
        resourceId: prompt.id,
        dedupeKey: `daily-entry:${prompt.id}:revealed:${partnerId}`,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `daily-entry:${prompt.id}:revealed`,
        aggregateType: "DailyPrompt",
        aggregateId: prompt.id,
        eventType: "daily-entry.revealed",
        occurredAt: now,
      });
    });

    return this.readDate(actor, localDate);
  }

  async addPostscript(
    role: IdentityRole,
    dto: AddDailyEntryPostscriptDto,
  ): Promise<DailyEntryDetail> {
    const actor = await this.identities.current(role);
    const localDate = this.clock.localDate(
      actor.couple.timezone,
      this.clock.now(),
    );
    const entryDate = parseLocalDate(localDate);
    if (dto.postscript.trim().length === 0) {
      throw validationFailed("postscript must not be blank");
    }

    await this.serializable(async (transaction) => {
      const own = await transaction.dailyEntry.findFirst({
        where: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          entryDate,
        },
        select: entryMetadataSelect,
      });
      if (!own) throw resourceNotFound();
      if (own.status !== DailyEntryStatus.REVEALED) {
        throw stateTransitionInvalid(
          "A postscript can only be added after both entries are revealed",
        );
      }
      if (own.version !== dto.version) throw stateConflict();

      const updated = await transaction.dailyEntry.updateMany({
        where: {
          id: own.id,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          entryDate,
          status: DailyEntryStatus.REVEALED,
          version: dto.version,
        },
        data: {
          postscript: dto.postscript,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw stateConflict();
    });

    return this.readDate(actor, localDate);
  }

  async calendar(
    role: IdentityRole,
    month: string,
  ): Promise<DailyEntryCalendar> {
    const actor = await this.identities.current(role);
    const partnerId = this.partnerId(actor);
    const { start, end } = parseMonth(month);
    const today = this.clock.localDate(actor.couple.timezone, this.clock.now());
    if (today.startsWith(`${month}-`)) {
      await this.ensurePrompt(actor.couple.id, today);
    }

    const prompts = await this.prisma.dailyPrompt.findMany({
      where: {
        coupleId: actor.couple.id,
        promptDate: { gte: start, lt: end },
      },
      orderBy: [{ promptDate: "asc" }, { id: "asc" }],
      select: {
        promptDate: true,
        entries: {
          select: {
            authorId: true,
            status: true,
          },
        },
      },
    });

    return {
      month,
      timezone: actor.couple.timezone,
      days: prompts.map((prompt) => {
        const mine = prompt.entries.find(
          (entry) => entry.authorId === actor.user.id,
        );
        const partner = prompt.entries.find(
          (entry) => entry.authorId === partnerId,
        );
        const revealed =
          mine?.status === DailyEntryStatus.REVEALED &&
          partner?.status === DailyEntryStatus.REVEALED;
        return {
          date: dateString(prompt.promptDate),
          status: aggregateStatus(mine, revealed),
          mineSubmitted: isSubmitted(mine?.status),
          partnerSubmitted: isSubmitted(partner?.status),
          revealed,
        };
      }),
    };
  }

  /**
   * Ensures the fixed system question for one couple-local date. The daily
   * prompt worker can reuse this method; reads also call it lazily so a delayed
   * worker never leaves the product without a question.
   */
  async ensurePrompt(
    coupleId: string,
    localDate: string,
    database: DailyPromptDatabase = this.prisma,
  ): Promise<DailyPromptRecord> {
    const promptDate = parseLocalDate(localDate);
    const epochDay = Math.floor(promptDate.valueOf() / DAY_MILLISECONDS);
    const question =
      DAILY_PROMPT_QUESTIONS[
        ((epochDay % DAILY_PROMPT_QUESTIONS.length) +
          DAILY_PROMPT_QUESTIONS.length) %
          DAILY_PROMPT_QUESTIONS.length
      ];
    if (!question) throw stateConflict();

    return database.dailyPrompt.upsert({
      where: { coupleId_promptDate: { coupleId, promptDate } },
      create: {
        coupleId,
        promptDate,
        question,
      },
      update: {},
      select: promptSelect,
    });
  }

  private async readDate(
    actor: IdentityResponse,
    localDate: string,
  ): Promise<DailyEntryDetail> {
    const entryDate = parseLocalDate(localDate);
    const partnerId = this.partnerId(actor);
    const prompt = await this.ensurePrompt(actor.couple.id, localDate);

    const mine = await this.prisma.dailyEntry.findFirst({
      where: {
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        entryDate,
      },
      select: ownEntrySelect,
    });

    // This query intentionally excludes content and postscript. Do not replace
    // it with a full aggregate load followed by response-field deletion.
    const partnerMetadata = await this.prisma.dailyEntry.findFirst({
      where: {
        coupleId: actor.couple.id,
        authorId: partnerId,
        entryDate,
      },
      select: entryMetadataSelect,
    });
    const revealed =
      mine?.status === DailyEntryStatus.REVEALED &&
      partnerMetadata?.status === DailyEntryStatus.REVEALED;

    let partner: DailyEntryDetail["partner"] = {
      submitted: isSubmitted(partnerMetadata?.status),
    };
    if (revealed && partnerMetadata) {
      const revealedEntry = await this.prisma.dailyEntry.findFirst({
        where: {
          id: partnerMetadata.id,
          coupleId: actor.couple.id,
          authorId: partnerId,
          entryDate,
          status: DailyEntryStatus.REVEALED,
        },
        select: revealedPartnerSelect,
      });
      if (!revealedEntry?.submittedAt || !revealedEntry.revealedAt) {
        throw stateConflict();
      }
      partner = {
        submitted: true,
        answer: revealedEntry.content,
        postscript: revealedEntry.postscript,
        submittedAt: revealedEntry.submittedAt.toISOString(),
        revealedAt: revealedEntry.revealedAt.toISOString(),
      };
    }

    return {
      date: localDate,
      timezone: actor.couple.timezone,
      prompt: { id: prompt.id, text: prompt.question },
      status: aggregateStatus(mine, revealed),
      mine: mine ? this.presentMine(mine) : null,
      partner,
    };
  }

  private presentMine(
    entry: OwnEntryRecord,
  ): NonNullable<DailyEntryDetail["mine"]> {
    return {
      answer: entry.content,
      postscript: entry.postscript,
      status: entry.status,
      version: entry.version,
      submittedAt: instantString(entry.submittedAt),
      revealedAt: instantString(entry.revealedAt),
    };
  }

  private partnerId(actor: IdentityResponse): string {
    const partner = actor.couple.members.find(
      (member) => member.id !== actor.user.id,
    );
    if (!partner) throw resourceNotFound();
    return partner.id;
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
