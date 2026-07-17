import { Inject, Injectable } from "@nestjs/common";
import {
  NoteStatus,
  Prisma,
  ReactionTargetType,
  RecycleBinResourceType,
  RecycleBinVisibility,
  type NoteType,
} from "@prisma/client";
import { Clock } from "../common/clock/clock";
import {
  actionForbidden,
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
import type {
  ReactionRecord,
  ReactionSummary,
} from "../memories/memory.presentation";
import {
  createRecycleBinItem,
  nullableInstant,
} from "../recycle-bin/recycle-bin.persistence";
import {
  cancelScheduledEvent,
  createPrivateNotification,
  enqueueOutboxEvent,
  upsertScheduledEvent,
} from "../shared-events/persistent-event";
import type {
  CreateNoteDto,
  ListNotesQueryDto,
  MarkNoteViewedDto,
  NoteReactionDto,
  ReorderNotesDto,
  UpdateNoteDto,
} from "./dto/note.dto";
import {
  effectiveNoteStatus,
  isNoteRevealable,
  type NoteRecord,
  type NoteView,
  toNoteView,
} from "./note.presentation";

export const noteSelect = Prisma.validator<Prisma.NoteSelect>()({
  id: true,
  coupleId: true,
  authorId: true,
  recipientId: true,
  type: true,
  status: true,
  version: true,
  content: true,
  color: true,
  icon: true,
  position: true,
  isPinned: true,
  keepAfterViewed: true,
  showAt: true,
  visibleAt: true,
  expiresAt: true,
  viewedAt: true,
  archivedAt: true,
  sourceStatusId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

type NoteDatabase = Pick<
  Prisma.TransactionClient,
  | "note"
  | "notification"
  | "outboxEvent"
  | "reaction"
  | "recycleBinItem"
  | "scheduledEvent"
>;

export type NotesResponse = {
  serverNow: string;
  items: NoteView[];
};

function parseOptionalInstant(
  value: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) {
    throw validationFailed(`${field} must be a valid ISO 8601 instant`);
  }
  return instant;
}

function publishedStatus(showAt: Date | null, now: Date): NoteStatus {
  return showAt !== null && showAt > now
    ? NoteStatus.SCHEDULED
    : NoteStatus.VISIBLE;
}

function validateTiming(
  showAt: Date | null,
  expiresAt: Date | null,
  status: NoteStatus,
  now: Date,
): void {
  if (expiresAt === null) return;
  const lowerBound =
    status === NoteStatus.SCHEDULED && showAt !== null ? showAt : now;
  if (expiresAt <= lowerBound) {
    throw validationFailed(
      status === NoteStatus.SCHEDULED
        ? "expiresAt must be later than showAt"
        : "expiresAt must be in the future",
    );
  }
}

function otherMember(actor: IdentityResponse) {
  const recipient = actor.couple.members.find(
    (member) => member.id !== actor.user.id,
  );
  if (!recipient) throw resourceNotFound();
  return recipient;
}

function normalizeNullable(
  value: string | null | undefined,
): string | null | undefined {
  return value === "" ? null : value;
}

function byNoteId(reactions: ReactionRecord[]): Map<string, ReactionRecord[]> {
  const grouped = new Map<string, ReactionRecord[]>();
  for (const reaction of reactions as Array<
    ReactionRecord & { targetId: string }
  >) {
    const group = grouped.get(reaction.targetId) ?? [];
    group.push(reaction);
    grouped.set(reaction.targetId, group);
  }
  return grouped;
}

@Injectable()
export class NotesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async list(
    role: IdentityRole,
    query: ListNotesQueryDto,
  ): Promise<NotesResponse> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const scope = query.scope ?? "all";
    const notes = (await this.prisma.note.findMany({
      where: {
        coupleId: actor.couple.id,
        deletedAt: null,
        AND: [
          scope === "sent"
            ? { authorId: actor.user.id }
            : scope === "received"
              ? { recipientId: actor.user.id, status: { not: "DRAFT" } }
              : {
                  OR: [
                    { authorId: actor.user.id },
                    {
                      recipientId: actor.user.id,
                      status: { not: "DRAFT" },
                    },
                  ],
                },
          ...(query.includeArchived
            ? []
            : [
                {
                  status: {
                    notIn: [NoteStatus.ARCHIVED, NoteStatus.EXPIRED],
                  },
                },
              ]),
        ],
      },
      orderBy: [
        { isPinned: "desc" },
        { position: "asc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: noteSelect,
    })) as NoteRecord[];
    const visibleNotes = notes.filter((note) => {
      const status = effectiveNoteStatus(note, now);
      if (note.recipientId === actor.user.id) {
        if (status === NoteStatus.EXPIRED) return false;
        if (status === NoteStatus.ARCHIVED && !note.keepAfterViewed) {
          return false;
        }
      }
      return (
        query.includeArchived ||
        (status !== NoteStatus.ARCHIVED && status !== NoteStatus.EXPIRED)
      );
    });
    const reactionMap = await this.reactionsForNotes(
      this.prisma,
      actor.couple.id,
      visibleNotes.map((note) => note.id),
    );
    return {
      serverNow: now.toISOString(),
      items: visibleNotes.map((note) =>
        toNoteView(
          note,
          actor.user.id,
          actor.couple,
          now,
          reactionMap.get(note.id) ?? [],
        ),
      ),
    };
  }

  async get(role: IdentityRole, noteId: string): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const note = await this.findNote(this.prisma, actor.couple.id, noteId);
    if (
      note.recipientId === actor.user.id &&
      note.status === NoteStatus.DRAFT
    ) {
      throw resourceNotFound();
    }
    if (note.recipientId !== actor.user.id && note.authorId !== actor.user.id) {
      throw resourceNotFound();
    }
    if (
      note.recipientId === actor.user.id &&
      !note.keepAfterViewed &&
      note.status === NoteStatus.ARCHIVED
    ) {
      throw resourceNotFound();
    }
    if (
      note.recipientId === actor.user.id &&
      effectiveNoteStatus(note, now) === NoteStatus.EXPIRED
    ) {
      throw resourceNotFound();
    }
    const reactions = await this.reactionsForNotes(
      this.prisma,
      actor.couple.id,
      [note.id],
    );
    return toNoteView(
      note,
      actor.user.id,
      actor.couple,
      now,
      reactions.get(note.id) ?? [],
    );
  }

  async create(role: IdentityRole, dto: CreateNoteDto): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const recipient = otherMember(actor);
    const now = this.clock.now();
    const showAt = parseOptionalInstant(dto.showAt, "showAt") ?? null;
    const expiresAt = parseOptionalInstant(dto.expiresAt, "expiresAt") ?? null;
    const status =
      dto.publish === false ? NoteStatus.DRAFT : publishedStatus(showAt, now);
    validateTiming(showAt, expiresAt, status, now);

    const note = await this.serializable(async (transaction) => {
      const aggregate = await transaction.note.aggregate({
        where: { coupleId: actor.couple.id, deletedAt: null },
        _max: { position: true },
      });
      const created = (await transaction.note.create({
        data: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          recipientId: recipient.id,
          type: dto.type as NoteType,
          status,
          content: dto.content,
          color: normalizeNullable(dto.color) ?? null,
          icon: normalizeNullable(dto.icon) ?? null,
          position: (aggregate._max.position ?? -1) + 1,
          isPinned: dto.isPinned ?? false,
          keepAfterViewed: dto.keepAfterViewed ?? true,
          showAt,
          visibleAt: status === NoteStatus.VISIBLE ? now : null,
          expiresAt,
        },
        select: noteSelect,
      })) as NoteRecord;

      await this.syncNoteSchedules(transaction, created, now);
      if (status === NoteStatus.VISIBLE) {
        await this.notifyVisible(transaction, created, now);
      }
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note:${created.id}:created:v${created.version}`,
        aggregateType: "NOTE",
        aggregateId: created.id,
        eventType: "note.created",
        actorId: actor.user.id,
        recipientId: status === NoteStatus.DRAFT ? actor.user.id : recipient.id,
        version: created.version,
        occurredAt: now,
      });
      return created;
    });
    return toNoteView(note, actor.user.id, actor.couple, now, []);
  }

  async update(
    role: IdentityRole,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const fields = Object.keys(dto).filter((field) => field !== "version");
    if (fields.length === 0) {
      throw validationFailed("At least one note field must be updated");
    }

    const updated = await this.serializable(async (transaction) => {
      const existing = await this.findNote(
        transaction,
        actor.couple.id,
        noteId,
      );
      if (existing.authorId !== actor.user.id) throw actionForbidden();
      const alreadyDisplayed =
        existing.visibleAt !== null ||
        (existing.status === NoteStatus.SCHEDULED &&
          existing.showAt !== null &&
          existing.showAt <= now) ||
        (existing.status !== NoteStatus.DRAFT &&
          existing.status !== NoteStatus.SCHEDULED);
      if (alreadyDisplayed) throw actionForbidden();

      const showAt =
        dto.showAt === undefined
          ? existing.showAt
          : (parseOptionalInstant(dto.showAt, "showAt") ?? null);
      const expiresAt =
        dto.expiresAt === undefined
          ? existing.expiresAt
          : (parseOptionalInstant(dto.expiresAt, "expiresAt") ?? null);
      const wasPublished = existing.status !== NoteStatus.DRAFT;
      const publish = dto.publish ?? wasPublished;
      const nextStatus = publish
        ? publishedStatus(showAt, now)
        : NoteStatus.DRAFT;
      validateTiming(showAt, expiresAt, nextStatus, now);

      const changed = await transaction.note.updateMany({
        where: {
          id: noteId,
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          deletedAt: null,
          version: dto.version,
          status: { in: [NoteStatus.DRAFT, NoteStatus.SCHEDULED] },
          visibleAt: null,
        },
        data: {
          ...(dto.type === undefined ? {} : { type: dto.type as NoteType }),
          ...(dto.content === undefined ? {} : { content: dto.content }),
          ...(dto.color === undefined
            ? {}
            : { color: dto.color === "" ? null : dto.color }),
          ...(dto.icon === undefined
            ? {}
            : { icon: dto.icon === "" ? null : dto.icon }),
          ...(dto.isPinned === undefined ? {} : { isPinned: dto.isPinned }),
          ...(dto.keepAfterViewed === undefined
            ? {}
            : { keepAfterViewed: dto.keepAfterViewed }),
          showAt,
          expiresAt,
          status: nextStatus,
          visibleAt: nextStatus === NoteStatus.VISIBLE ? now : null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      const note = await this.findNote(transaction, actor.couple.id, noteId);
      await this.syncNoteSchedules(transaction, note, now);
      if (nextStatus === NoteStatus.VISIBLE) {
        await this.notifyVisible(transaction, note, now);
      }
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note:${note.id}:updated:v${note.version}`,
        aggregateType: "NOTE",
        aggregateId: note.id,
        eventType: "note.updated",
        actorId: actor.user.id,
        recipientId:
          existing.status === NoteStatus.DRAFT &&
          nextStatus === NoteStatus.DRAFT
            ? actor.user.id
            : note.recipientId,
        version: note.version,
        occurredAt: now,
      });
      return note;
    });
    return toNoteView(updated, actor.user.id, actor.couple, now, []);
  }

  async remove(
    role: IdentityRole,
    noteId: string,
    version: number,
  ): Promise<void> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const existing = await this.findNote(
        transaction,
        actor.couple.id,
        noteId,
      );
      const isAuthor = existing.authorId === actor.user.id;
      const isRecipient = existing.recipientId === actor.user.id;
      if (!isAuthor && !isRecipient) throw resourceNotFound();
      if (
        isRecipient &&
        (!isNoteRevealable(existing, actor.user.id, now) ||
          effectiveNoteStatus(existing, now) === NoteStatus.EXPIRED)
      ) {
        throw actionForbidden();
      }
      if (existing.status === NoteStatus.ARCHIVED) throw resourceNotFound();
      const changed = await transaction.note.updateMany({
        where: {
          id: noteId,
          coupleId: actor.couple.id,
          deletedAt: null,
          version,
        },
        data: {
          status: NoteStatus.ARCHIVED,
          archivedAt: now,
          ...(isAuthor ? { deletedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      await cancelScheduledEvent(transaction, `note:${noteId}:show`);
      await cancelScheduledEvent(transaction, `note:${noteId}:expire`);
      if (isRecipient) {
        await createPrivateNotification(transaction, {
          coupleId: actor.couple.id,
          recipientId: existing.authorId,
          type: "NOTE_ARCHIVED",
          dedupeKey: `note:${noteId}:archived:v${version + 1}`,
          resourceType: "NOTE",
          resourceId: noteId,
        });
      }
      if (isAuthor) {
        await createRecycleBinItem(transaction, {
          coupleId: actor.couple.id,
          resourceType: RecycleBinResourceType.NOTE,
          resourceId: noteId,
          deletedById: actor.user.id,
          deletedAt: now,
          restoreData: {
            status: existing.status,
            archivedAt: nullableInstant(existing.archivedAt),
            showAt: nullableInstant(existing.showAt),
            visibleAt: nullableInstant(existing.visibleAt),
            expiresAt: nullableInstant(existing.expiresAt),
            viewedAt: nullableInstant(existing.viewedAt),
          },
          ...(existing.status === NoteStatus.DRAFT ||
          existing.status === NoteStatus.SCHEDULED
            ? {
                visibility: RecycleBinVisibility.OWNER_ONLY,
                ownerId: actor.user.id,
              }
            : {}),
        });
      }
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note:${noteId}:${isAuthor ? "deleted" : "archived"}:v${version + 1}`,
        aggregateType: "NOTE",
        aggregateId: noteId,
        eventType: isAuthor ? "note.deleted" : "note.archived",
        actorId: actor.user.id,
        recipientId: isAuthor
          ? existing.status === NoteStatus.DRAFT
            ? actor.user.id
            : existing.recipientId
          : existing.authorId,
        version: version + 1,
        occurredAt: now,
      });
    });
  }

  async markViewed(
    role: IdentityRole,
    noteId: string,
    dto: MarkNoteViewedDto,
  ): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const note = await this.serializable(async (transaction) => {
      const existing = await this.findNote(
        transaction,
        actor.couple.id,
        noteId,
      );
      if (existing.recipientId !== actor.user.id) throw actionForbidden();
      if (dto.version !== undefined && dto.version !== existing.version) {
        throw stateConflict();
      }
      if (!isNoteRevealable(existing, actor.user.id, now)) {
        throw actionForbidden();
      }
      const effectiveStatus = effectiveNoteStatus(existing, now);
      if (effectiveStatus === NoteStatus.EXPIRED) throw resourceNotFound();
      if (existing.status === NoteStatus.VIEWED && existing.keepAfterViewed) {
        return existing;
      }
      if (
        existing.status !== NoteStatus.VISIBLE &&
        existing.status !== NoteStatus.SCHEDULED
      ) {
        throw resourceNotFound();
      }

      const nextStatus = existing.keepAfterViewed
        ? NoteStatus.VIEWED
        : NoteStatus.ARCHIVED;
      const changed = await transaction.note.updateMany({
        where: {
          id: noteId,
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
          deletedAt: null,
          version: existing.version,
          status: { in: [NoteStatus.SCHEDULED, NoteStatus.VISIBLE] },
          OR: [{ showAt: null }, { showAt: { lte: now } }],
        },
        data: {
          status: nextStatus,
          visibleAt: existing.visibleAt ?? now,
          viewedAt: now,
          ...(nextStatus === NoteStatus.ARCHIVED ? { archivedAt: now } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw stateConflict();
      const updated = await this.findNote(transaction, actor.couple.id, noteId);
      if (nextStatus === NoteStatus.ARCHIVED) {
        await cancelScheduledEvent(transaction, `note:${noteId}:expire`);
      }
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: existing.authorId,
        type: "NOTE_VIEWED",
        dedupeKey: `note:${noteId}:viewed:v${updated.version}`,
        resourceType: "NOTE",
        resourceId: noteId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note:${noteId}:${nextStatus === NoteStatus.ARCHIVED ? "disappeared" : "viewed"}:v${updated.version}`,
        aggregateType: "NOTE",
        aggregateId: noteId,
        eventType:
          nextStatus === NoteStatus.ARCHIVED
            ? "note.disappeared"
            : "note.viewed",
        actorId: actor.user.id,
        recipientId: existing.authorId,
        version: updated.version,
        occurredAt: now,
      });
      return updated;
    });
    const reactions = await this.reactionsForNotes(
      this.prisma,
      actor.couple.id,
      [note.id],
    );
    return toNoteView(
      note,
      actor.user.id,
      actor.couple,
      now,
      reactions.get(note.id) ?? [],
    );
  }

  async addReaction(
    role: IdentityRole,
    noteId: string,
    dto: NoteReactionDto,
  ): Promise<ReactionSummary[]> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const note = await this.findNote(transaction, actor.couple.id, noteId);
      this.assertCanReact(note, actor.user.id, now);
      const existing = await transaction.reaction.findUnique({
        where: {
          authorId_targetType_targetId_emoji: {
            authorId: actor.user.id,
            targetType: ReactionTargetType.NOTE,
            targetId: noteId,
            emoji: dto.emoji,
          },
        },
        select: { id: true },
      });
      if (existing) return;
      const reaction = await transaction.reaction.create({
        data: {
          coupleId: actor.couple.id,
          authorId: actor.user.id,
          targetType: ReactionTargetType.NOTE,
          targetId: noteId,
          emoji: dto.emoji,
        },
        select: { id: true },
      });
      await createPrivateNotification(transaction, {
        coupleId: actor.couple.id,
        recipientId: note.authorId,
        type: "NOTE_REACTION",
        dedupeKey: `note-reaction:${reaction.id}:added`,
        resourceType: "NOTE",
        resourceId: noteId,
      });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note-reaction:${reaction.id}:added`,
        aggregateType: "NOTE",
        aggregateId: noteId,
        eventType: "note.reaction_added",
        actorId: actor.user.id,
        recipientId: note.authorId,
        occurredAt: now,
      });
    });
    return this.reactionSummaries(actor.couple.id, noteId, actor.user.id);
  }

  async removeReaction(
    role: IdentityRole,
    noteId: string,
    dto: NoteReactionDto,
  ): Promise<ReactionSummary[]> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    await this.serializable(async (transaction) => {
      const note = await this.findNote(transaction, actor.couple.id, noteId);
      this.assertCanReact(note, actor.user.id, now);
      const reaction = await transaction.reaction.findUnique({
        where: {
          authorId_targetType_targetId_emoji: {
            authorId: actor.user.id,
            targetType: ReactionTargetType.NOTE,
            targetId: noteId,
            emoji: dto.emoji,
          },
        },
        select: { id: true },
      });
      if (!reaction) return;
      await transaction.reaction.delete({ where: { id: reaction.id } });
      await enqueueOutboxEvent(transaction, {
        coupleId: actor.couple.id,
        dedupeKey: `note-reaction:${reaction.id}:removed`,
        aggregateType: "NOTE",
        aggregateId: noteId,
        eventType: "note.reaction_removed",
        actorId: actor.user.id,
        recipientId: note.authorId,
        occurredAt: now,
      });
    });
    return this.reactionSummaries(actor.couple.id, noteId, actor.user.id);
  }

  async reorder(
    role: IdentityRole,
    dto: ReorderNotesDto,
  ): Promise<NotesResponse> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const ids = dto.items.map((item) => item.id);
    const positions = dto.items.map((item) => item.position);
    if (new Set(ids).size !== ids.length) {
      throw validationFailed(
        "Each note can appear only once in an order update",
      );
    }
    if (new Set(positions).size !== positions.length) {
      throw validationFailed("Each note position must be unique");
    }

    await this.serializable(async (transaction) => {
      const notes = (await transaction.note.findMany({
        where: {
          coupleId: actor.couple.id,
          id: { in: ids },
          deletedAt: null,
        },
        select: noteSelect,
      })) as NoteRecord[];
      if (notes.length !== ids.length) throw resourceNotFound();
      const records = new Map(notes.map((note) => [note.id, note]));
      for (const item of dto.items) {
        const note = records.get(item.id);
        if (!note) throw resourceNotFound();
        if (
          note.authorId !== actor.user.id &&
          (note.recipientId !== actor.user.id ||
            note.status === NoteStatus.DRAFT)
        ) {
          throw resourceNotFound();
        }
        const changed = await transaction.note.updateMany({
          where: {
            id: item.id,
            coupleId: actor.couple.id,
            deletedAt: null,
            version: item.version,
          },
          data: {
            position: item.position,
            ...(item.isPinned === undefined ? {} : { isPinned: item.isPinned }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw stateConflict();
        await enqueueOutboxEvent(transaction, {
          coupleId: actor.couple.id,
          dedupeKey: `note:${note.id}:ordered:v${item.version + 1}`,
          aggregateType: "NOTE",
          aggregateId: note.id,
          eventType: "note.ordered",
          actorId: actor.user.id,
          recipientId:
            note.status === NoteStatus.DRAFT ? actor.user.id : note.recipientId,
          version: item.version + 1,
          occurredAt: now,
        });
      }
    });
    return this.list(role, {});
  }

  private async syncNoteSchedules(
    transaction: NoteDatabase,
    note: NoteRecord,
    now: Date,
  ): Promise<void> {
    if (note.status === NoteStatus.SCHEDULED && note.showAt !== null) {
      await upsertScheduledEvent(transaction, {
        coupleId: note.coupleId,
        dedupeKey: `note:${note.id}:show`,
        type: "NOTE_SHOW",
        payload: { noteId: note.id },
        runAt: note.showAt,
      });
    } else {
      await cancelScheduledEvent(transaction, `note:${note.id}:show`);
    }
    if (note.status !== NoteStatus.DRAFT && note.expiresAt !== null) {
      await upsertScheduledEvent(transaction, {
        coupleId: note.coupleId,
        dedupeKey: `note:${note.id}:expire`,
        type: "NOTE_EXPIRE",
        payload: { noteId: note.id },
        runAt: note.expiresAt,
      });
    } else {
      await cancelScheduledEvent(transaction, `note:${note.id}:expire`);
    }

    if (
      note.status === NoteStatus.VISIBLE &&
      note.expiresAt !== null &&
      note.expiresAt <= now
    ) {
      throw validationFailed("expiresAt must be in the future");
    }
  }

  private async notifyVisible(
    transaction: NoteDatabase,
    note: NoteRecord,
    now: Date,
  ): Promise<void> {
    await createPrivateNotification(transaction, {
      coupleId: note.coupleId,
      recipientId: note.recipientId,
      type: "NOTE_VISIBLE",
      dedupeKey: `note:${note.id}:visible`,
      resourceType: "NOTE",
      resourceId: note.id,
    });
    await enqueueOutboxEvent(transaction, {
      coupleId: note.coupleId,
      dedupeKey: `note:${note.id}:visible:v${note.version}`,
      aggregateType: "NOTE",
      aggregateId: note.id,
      eventType: "note.visible",
      actorId: note.authorId,
      recipientId: note.recipientId,
      version: note.version,
      occurredAt: now,
    });
  }

  private assertCanReact(note: NoteRecord, actorId: string, now: Date): void {
    if (note.recipientId !== actorId) throw actionForbidden();
    if (!isNoteRevealable(note, actorId, now)) throw actionForbidden();
    const status = effectiveNoteStatus(note, now);
    if (status !== NoteStatus.VISIBLE && status !== NoteStatus.VIEWED) {
      throw resourceNotFound();
    }
  }

  private async findNote(
    database: Pick<Prisma.TransactionClient, "note">,
    coupleId: string,
    noteId: string,
  ): Promise<NoteRecord> {
    const note = (await database.note.findFirst({
      where: { id: noteId, coupleId, deletedAt: null },
      select: noteSelect,
    })) as NoteRecord | null;
    if (!note) throw resourceNotFound();
    return note;
  }

  private async reactionsForNotes(
    database: Pick<Prisma.TransactionClient, "reaction">,
    coupleId: string,
    noteIds: string[],
  ): Promise<Map<string, ReactionRecord[]>> {
    if (noteIds.length === 0) return new Map();
    const reactions = await database.reaction.findMany({
      where: {
        coupleId,
        targetType: ReactionTargetType.NOTE,
        targetId: { in: noteIds },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { targetId: true, authorId: true, emoji: true },
    });
    return byNoteId(reactions as Array<ReactionRecord & { targetId: string }>);
  }

  private async reactionSummaries(
    coupleId: string,
    noteId: string,
    actorId: string,
  ): Promise<ReactionSummary[]> {
    const grouped = await this.reactionsForNotes(this.prisma, coupleId, [
      noteId,
    ]);
    const reactions = grouped.get(noteId) ?? [];
    const summaries = new Map<string, ReactionSummary>();
    for (const reaction of reactions) {
      const current = summaries.get(reaction.emoji);
      if (current) {
        current.count += 1;
        if (reaction.authorId === actorId) current.reactedByMe = true;
      } else {
        summaries.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          reactedByMe: reaction.authorId === actorId,
        });
      }
    }
    return [...summaries.values()].sort((left, right) =>
      left.emoji.localeCompare(right.emoji),
    );
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
        throw error;
      }
    }
    throw stateConflict();
  }
}
