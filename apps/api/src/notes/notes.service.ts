import { Inject, Injectable } from "@nestjs/common";
import {
  actionForbidden,
  resourceNotFound,
  stateConflict,
} from "../common/http/api-exception";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { CreateNoteDto, MarkNoteViewedDto } from "./dto/note.dto";
import { noteSelect, toNoteView, type NoteView } from "./note.presentation";

export type NotesResponse = {
  serverNow: string;
  items: NoteView[];
};

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

  async list(role: IdentityRole): Promise<NotesResponse> {
    const actor = await this.identities.current(role);
    const notes = await this.prisma.note.findMany({
      where: {
        coupleId: actor.couple.id,
        OR: [{ authorId: actor.user.id }, { recipientId: actor.user.id }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: noteSelect,
    });
    return {
      serverNow: this.clock.now().toISOString(),
      items: notes.map((note) => toNoteView(note, actor.couple)),
    };
  }

  async create(role: IdentityRole, dto: CreateNoteDto): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const recipient = actor.couple.members.find(
      (member) => member.id !== actor.user.id,
    );
    if (!recipient) throw resourceNotFound();
    const note = await this.prisma.note.create({
      data: {
        coupleId: actor.couple.id,
        authorId: actor.user.id,
        recipientId: recipient.id,
        content: dto.content,
        icon: dto.icon ?? null,
      },
      select: noteSelect,
    });
    return toNoteView(note, actor.couple);
  }

  async markViewed(
    role: IdentityRole,
    noteId: string,
    dto: MarkNoteViewedDto,
  ): Promise<NoteView> {
    const actor = await this.identities.current(role);
    const existing = await this.prisma.note.findFirst({
      where: { id: noteId, coupleId: actor.couple.id },
      select: noteSelect,
    });
    if (!existing) throw resourceNotFound();
    if (existing.recipientId !== actor.user.id) throw actionForbidden();
    if (dto.version !== undefined && dto.version !== existing.version) {
      throw stateConflict({ currentVersion: existing.version });
    }
    if (existing.readAt) return toNoteView(existing, actor.couple);

    const changed = await this.prisma.note.updateMany({
      where: {
        id: noteId,
        coupleId: actor.couple.id,
        recipientId: actor.user.id,
        version: existing.version,
        readAt: null,
      },
      data: { readAt: this.clock.now(), version: { increment: 1 } },
    });
    if (changed.count !== 1) throw stateConflict();
    const updated = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: noteSelect,
    });
    if (!updated) throw resourceNotFound();
    return toNoteView(updated, actor.couple);
  }
}
