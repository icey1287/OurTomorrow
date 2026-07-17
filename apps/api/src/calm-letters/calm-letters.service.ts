import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { CalmLetterStatus, Prisma } from "@prisma/client";
import { AuditService } from "../common/audit/audit.service";
import { Clock } from "../common/clock/clock";
import {
  actionForbidden,
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
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import {
  calmLetterContentSelect,
  calmLetterMetadataSelect,
  toCalmLetterSummary,
  type CalmLetterDetail,
  type CalmLetterMetadataRecord,
  type CalmLetterSummary,
} from "./calm-letter.presentation";
import type {
  CalmLetterActionDto,
  CreateCalmLetterDto,
} from "./dto/calm-letter.dto";

type CalmLetterDatabase = Pick<Prisma.TransactionClient, "calmLetter">;

const SERIALIZABLE_ATTEMPTS = 3;

export function calmLetterUnlockEventKey(calmLetterId: string): string {
  return `calm-letter:${calmLetterId}:unlock`;
}

function parseUnlockAt(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw validationFailed("unlockAt must include Z or an explicit UTC offset");
  }
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) {
    throw validationFailed("unlockAt must be a valid ISO 8601 instant");
  }
  return result;
}

function contentLocked(unlockAt: Date | null): ApiException {
  return new ApiException(
    HttpStatus.LOCKED,
    "CONTENT_LOCKED",
    "This calm letter is not available yet",
    { unlockAt: unlockAt?.toISOString() ?? null },
  );
}

@Injectable()
export class CalmLettersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(AuditService)
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  async list(role: IdentityRole): Promise<CalmLetterSummary[]> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.materializeDueForCouple(actor.couple.id, now);

    const letters = await this.prisma.calmLetter.findMany({
      where: {
        coupleId: actor.couple.id,
        deletedAt: null,
        status: { not: CalmLetterStatus.DRAFT },
        OR: [{ authorId: actor.user.id }, { recipientId: actor.user.id }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: calmLetterMetadataSelect,
    });
    return letters.map((letter) => toCalmLetterSummary(letter, actor.user.id));
  }

  async get(
    role: IdentityRole,
    calmLetterId: string,
  ): Promise<CalmLetterDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.materializeUnlock(actor.couple.id, calmLetterId, now);
    return this.detailForActor(actor, calmLetterId);
  }

  async create(
    role: IdentityRole,
    dto: CreateCalmLetterDto,
  ): Promise<CalmLetterDetail> {
    const actor = await this.identities.current(role);
    const partner = this.partner(actor);
    const now = this.clock.now();
    const unlockAt = parseUnlockAt(dto.unlockAt);
    const status =
      unlockAt !== null && unlockAt > now
        ? CalmLetterStatus.LOCKED
        : CalmLetterStatus.AVAILABLE;
    const calmLetterId = randomUUID();

    await this.serializable(async (transaction) => {
      const letter = await transaction.calmLetter.create({
        data: {
          id: calmLetterId,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          recipientId: partner.id,
          purpose: dto.purpose,
          status,
          content: dto.content,
          unlockAt,
          sentAt: now,
          createdAt: now,
        },
        select: { id: true, version: true },
      });
      if (status === CalmLetterStatus.LOCKED && unlockAt !== null) {
        await upsertScheduledEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: calmLetterUnlockEventKey(calmLetterId),
          type: "CALM_LETTER_UNLOCK",
          payload: { calmLetterId },
          runAt: unlockAt,
        });
      }
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: partner.id,
        type:
          status === CalmLetterStatus.LOCKED
            ? "CALM_LETTER_WAITING"
            : "CALM_LETTER_AVAILABLE",
        dedupeKey: `calm-letter:${calmLetterId}:created:notification`,
        resourceType: "CALM_LETTER",
        resourceId: calmLetterId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `calm-letter:${calmLetterId}:v${letter.version}:created`,
        aggregateType: "CALM_LETTER",
        aggregateId: calmLetterId,
        eventType: "calm_letter.created",
        actorId: actor.user.id,
        recipientId: partner.id,
        version: letter.version,
        occurredAt: now,
      });
    });

    return this.detailForActor(actor, calmLetterId);
  }

  async open(
    role: IdentityRole,
    calmLetterId: string,
    dto: CalmLetterActionDto,
  ): Promise<CalmLetterDetail> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();

    await this.serializable(async (transaction) => {
      const current = await this.findMetadata(
        transaction,
        actor.couple.id,
        calmLetterId,
      );
      if (current.recipientId !== actor.user.id) throw actionForbidden();
      if (current.status === CalmLetterStatus.OPENED) return;
      if (current.status === CalmLetterStatus.ARCHIVED) {
        throw stateConflict({ currentStatus: current.status });
      }
      if (current.version !== dto.version) {
        throw stateConflict({ currentVersion: current.version });
      }
      if (
        current.status === CalmLetterStatus.LOCKED &&
        (current.unlockAt === null || current.unlockAt > now)
      ) {
        throw contentLocked(current.unlockAt);
      }
      if (
        current.status !== CalmLetterStatus.LOCKED &&
        current.status !== CalmLetterStatus.AVAILABLE
      ) {
        throw stateConflict({ currentStatus: current.status });
      }

      const changed = await transaction.calmLetter.updateMany({
        where: {
          id: calmLetterId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          deletedAt: null,
          status: current.status,
          version: current.version,
          ...(current.status === CalmLetterStatus.LOCKED
            ? { unlockAt: { lte: now } }
            : {}),
        },
        data: {
          status: CalmLetterStatus.OPENED,
          openedAt: now,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();

      await cancelScheduledEvent(
        transaction,
        calmLetterUnlockEventKey(calmLetterId),
      );
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: current.authorId,
        type: "CALM_LETTER_OPENED",
        dedupeKey: `calm-letter:${calmLetterId}:opened:notification`,
        resourceType: "CALM_LETTER",
        resourceId: calmLetterId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `calm-letter:${calmLetterId}:v${current.version + 1}:opened`,
        aggregateType: "CALM_LETTER",
        aggregateId: calmLetterId,
        eventType: "calm_letter.opened",
        actorId: actor.user.id,
        recipientId: current.authorId,
        version: current.version + 1,
        occurredAt: now,
      });
      await this.audit.record(
        {
          action: "CALM_LETTER_OPENED",
          actorId: actor.user.id,
          coupleId: actor.couple.id,
          resourceType: "CALM_LETTER",
          resourceId: calmLetterId,
          metadata: {
            resourceId: calmLetterId,
            status: CalmLetterStatus.OPENED,
            version: current.version + 1,
          },
        },
        transaction,
      );
    });

    return this.detailForActor(actor, calmLetterId);
  }

  /** Idempotent entry point for the persisted CALM_LETTER_UNLOCK worker job. */
  async materializeUnlock(
    coupleId: string,
    calmLetterId: string,
    at: Date = this.clock.now(),
  ): Promise<void> {
    await this.serializable(async (transaction) => {
      const current = await transaction.calmLetter.findFirst({
        where: { id: calmLetterId, coupleId, deletedAt: null },
        select: calmLetterMetadataSelect,
      });
      if (
        !current ||
        current.status !== CalmLetterStatus.LOCKED ||
        current.unlockAt === null ||
        current.unlockAt > at
      ) {
        return;
      }

      const changed = await transaction.calmLetter.updateMany({
        where: {
          id: current.id,
          coupleId,
          deletedAt: null,
          status: CalmLetterStatus.LOCKED,
          version: current.version,
          unlockAt: { lte: at },
        },
        data: {
          status: CalmLetterStatus.AVAILABLE,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) return;

      await createPrivateNotification(transaction, {
        coupleId,
        recipientId: current.recipientId,
        type: "CALM_LETTER_AVAILABLE",
        dedupeKey: `calm-letter:${calmLetterId}:available:notification`,
        resourceType: "CALM_LETTER",
        resourceId: calmLetterId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId,
        dedupeKey: `calm-letter:${calmLetterId}:v${current.version + 1}:available`,
        aggregateType: "CALM_LETTER",
        aggregateId: calmLetterId,
        eventType: "calm_letter.available",
        actorId: current.authorId,
        recipientId: current.recipientId,
        version: current.version + 1,
        occurredAt: at,
      });
    });
  }

  private async materializeDueForCouple(
    coupleId: string,
    now: Date,
  ): Promise<void> {
    const due = await this.prisma.calmLetter.findMany({
      where: {
        coupleId,
        deletedAt: null,
        status: CalmLetterStatus.LOCKED,
        unlockAt: { lte: now },
      },
      orderBy: [{ unlockAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    for (const letter of due) {
      await this.materializeUnlock(coupleId, letter.id, now);
    }
  }

  private async detailForActor(
    actor: IdentityResponse,
    calmLetterId: string,
  ): Promise<CalmLetterDetail> {
    const metadata = await this.findMetadata(
      this.prisma,
      actor.couple.id,
      calmLetterId,
    );
    if (
      metadata.authorId !== actor.user.id &&
      metadata.recipientId !== actor.user.id
    ) {
      throw resourceNotFound();
    }
    const summary = toCalmLetterSummary(metadata, actor.user.id);
    if (!summary.bodyAvailable) return summary;

    const body = await this.prisma.calmLetter.findFirst({
      where: {
        id: calmLetterId,
        coupleId: actor.couple.id,
        deletedAt: null,
        ...(metadata.authorId === actor.user.id
          ? { authorId: actor.user.id }
          : {
              recipientId: actor.user.id,
              status: CalmLetterStatus.OPENED,
            }),
      },
      select: calmLetterContentSelect,
    });
    if (!body) throw resourceNotFound();
    return { ...summary, content: body.content };
  }

  private async findMetadata(
    database: CalmLetterDatabase,
    coupleId: string,
    calmLetterId: string,
  ): Promise<CalmLetterMetadataRecord> {
    const letter = await database.calmLetter.findFirst({
      where: {
        id: calmLetterId,
        coupleId,
        deletedAt: null,
        status: { not: CalmLetterStatus.DRAFT },
      },
      select: calmLetterMetadataSelect,
    });
    if (!letter) throw resourceNotFound();
    return letter;
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
    for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002") &&
          attempt < SERIALIZABLE_ATTEMPTS
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002")
        ) {
          throw stateConflict();
        }
        throw error;
      }
    }
    throw stateConflict();
  }
}
