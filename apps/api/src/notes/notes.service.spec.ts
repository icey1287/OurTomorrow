import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import {
  IdentityService,
  type IdentityResponse,
} from "../identity/identity.service";
import type { NoteRecord } from "./note.presentation";
import { NotesService } from "./notes.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const NOTE_ID = "70000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "71000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T08:00:00.000Z");

const actor = {
  role: "boy" as const,
  user: {
    id: BOY_ID,
    version: 1,
    displayName: "甲",
    slot: 1 as const,
    role: "boy" as const,
    nicknameInRelationship: null,
    avatarUrl: null,
  },
  couple: {
    id: COUPLE_ID,
    version: 1,
    name: "我们的明天",
    startDate: "2024-01-01",
    timezone: "Asia/Shanghai",
    signature: null,
    theme: "system" as const,
    members: [
      {
        id: BOY_ID,
        version: 1,
        displayName: "甲",
        slot: 1 as const,
        role: "boy" as const,
        nicknameInRelationship: null,
        avatarUrl: null,
      },
      {
        id: GIRL_ID,
        version: 1,
        displayName: "乙",
        slot: 2 as const,
        role: "girl" as const,
        nicknameInRelationship: null,
        avatarUrl: null,
      },
    ],
  },
};

function note(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return {
    id: NOTE_ID,
    coupleId: COUPLE_ID,
    authorId: BOY_ID,
    recipientId: GIRL_ID,
    type: "SURPRISE",
    status: "SCHEDULED",
    version: 1,
    content: "今晚看窗外。",
    color: "rose",
    icon: "gift",
    position: 2,
    isPinned: false,
    keepAfterViewed: true,
    showAt: new Date("2026-07-17T12:00:00.000Z"),
    visibleAt: null,
    expiresAt: null,
    viewedAt: null,
    archivedAt: null,
    sourceStatusId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function clock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function identities(
  selected: IdentityResponse = actor as IdentityResponse,
): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(selected),
  } as unknown as IdentityService;
}

describe("NotesService", () => {
  it("keeps a newly created draft private to its author across notifications, schedules, and realtime outbox", async () => {
    const created = note({
      status: "DRAFT",
      showAt: new Date("2026-07-17T12:00:00.000Z"),
    });
    const transaction = {
      note: {
        aggregate: vi.fn().mockResolvedValue({ _max: { position: 1 } }),
        create: vi.fn().mockResolvedValue(created),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await service.create("boy", {
      type: "SURPRISE",
      content: "还没准备好告诉你。",
      showAt: "2026-07-17T12:00:00.000Z",
      publish: false,
    });

    expect(transaction.notification.upsert).not.toHaveBeenCalled();
    expect(
      transaction.scheduledEvent.upsert.mock.calls.map(
        ([input]) => input.create.type,
      ),
    ).toEqual(["OUTBOX_RETRY"]);
    const outboxPayload =
      transaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload;
    expect(outboxPayload).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: BOY_ID,
      recipientId: BOY_ID,
      version: 1,
    });
    expect(JSON.stringify(outboxPayload)).not.toContain("还没准备好告诉你");
  });

  it("derives the recipient and persists scheduling plus content-free outbox metadata in one transaction", async () => {
    const created = note();
    const transaction = {
      note: {
        aggregate: vi.fn().mockResolvedValue({ _max: { position: 1 } }),
        create: vi.fn().mockResolvedValue(created),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;
    const service = new NotesService(prisma, identities(), clock());

    await service.create("boy", {
      type: "SURPRISE",
      content: "今晚看窗外。",
      color: "rose",
      icon: "gift",
      showAt: "2026-07-17T12:00:00.000Z",
    });

    expect(transaction.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: BOY_ID,
          recipientId: GIRL_ID,
          status: "SCHEDULED",
        }),
      }),
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dedupeKey: `note:${NOTE_ID}:show` },
        create: expect.objectContaining({
          type: "NOTE_SHOW",
          payload: { noteId: NOTE_ID },
          runAt: new Date("2026-07-17T12:00:00.000Z"),
        }),
      }),
    );
    const outboxCall = transaction.outboxEvent.upsert.mock.calls[0]?.[0];
    expect(outboxCall.create.payload).toEqual(
      expect.objectContaining({
        aggregateId: NOTE_ID,
        actorId: BOY_ID,
        recipientId: GIRL_ID,
        version: 1,
      }),
    );
    expect(JSON.stringify(outboxCall.create.payload)).not.toContain(
      "今晚看窗外",
    );
    expect(outboxCall.create.payload).not.toHaveProperty("content");
    expect(outboxCall.create.payload).not.toHaveProperty("body");
  });

  it("uses the injected clock to reject edits once showAt is reached even if the worker has not updated status", async () => {
    const transaction = {
      note: { findFirst: vi.fn().mockResolvedValue(note({ showAt: NOW })) },
    };
    const service = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await expect(
      service.update("boy", NOTE_ID, { version: 1, content: "晚一点看" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 403,
    );
  });

  it("keeps an unpublished draft editable even when its tentative showAt is in the past", async () => {
    const before = note({
      status: "DRAFT",
      showAt: new Date("2026-07-17T07:00:00.000Z"),
    });
    const after = note({
      status: "DRAFT",
      version: 2,
      content: "还想再改一改。",
      showAt: new Date("2026-07-17T07:00:00.000Z"),
    });
    const transaction = {
      note: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce(after),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await expect(
      service.update("boy", NOTE_ID, {
        version: 1,
        content: "还想再改一改。",
      }),
    ).resolves.toMatchObject({
      status: "DRAFT",
      content: "还想再改一改。",
      canEdit: true,
    });
    expect(transaction.notification.upsert).not.toHaveBeenCalled();
    expect(
      transaction.scheduledEvent.upsert.mock.calls.map(
        ([input]) => input.create.type,
      ),
    ).toEqual(["OUTBOX_RETRY"]);
    expect(
      transaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload,
    ).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: BOY_ID,
      recipientId: BOY_ID,
      version: 2,
    });
  });

  it("atomically archives a disappear-after-view note and notifies its author", async () => {
    const recipient = {
      ...actor,
      role: "girl" as const,
      user: actor.couple.members[1]!,
    };
    const before = note({
      status: "VISIBLE",
      showAt: null,
      visibleAt: NOW,
      keepAfterViewed: false,
    });
    const after = note({
      status: "ARCHIVED",
      version: 2,
      showAt: null,
      visibleAt: NOW,
      keepAfterViewed: false,
      viewedAt: NOW,
      archivedAt: NOW,
    });
    const transaction = {
      note: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(before)
          .mockResolvedValueOnce(after),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
      reaction: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new NotesService(prisma, identities(recipient), clock());

    const result = await service.markViewed("girl", NOTE_ID, { version: 1 });

    expect(transaction.note.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ARCHIVED",
          viewedAt: NOW,
          archivedAt: NOW,
          version: { increment: 1 },
        }),
      }),
    );
    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: BOY_ID,
          type: "NOTE_VIEWED",
        }),
      }),
    );
    expect(
      transaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload,
    ).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: GIRL_ID,
      recipientId: BOY_ID,
      version: 2,
    });
    expect(result).toMatchObject({ status: "ARCHIVED", isPlaceholder: false });
  });

  it("routes a recipient archive event to the author just like its notification", async () => {
    const recipient = {
      ...actor,
      role: "girl" as const,
      user: actor.couple.members[1]!,
    };
    const transaction = {
      note: {
        findFirst: vi.fn().mockResolvedValue(
          note({
            status: "VISIBLE",
            showAt: null,
            visibleAt: NOW,
          }),
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(transaction)),
      } as unknown as PrismaService,
      identities(recipient),
      clock(),
    );

    await service.remove("girl", NOTE_ID, 1);

    expect(transaction.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipientId: BOY_ID,
          type: "NOTE_ARCHIVED",
        }),
      }),
    );
    expect(
      transaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload,
    ).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: GIRL_ID,
      recipientId: BOY_ID,
      version: 2,
    });
  });

  it("keeps draft delete and reorder events in the author's realtime room", async () => {
    const draft = note({ status: "DRAFT", showAt: null });
    const deleteTransaction = {
      note: {
        findFirst: vi.fn().mockResolvedValue(draft),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const deleteService = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(deleteTransaction)),
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await deleteService.remove("boy", NOTE_ID, 1);

    expect(deleteTransaction.notification.upsert).not.toHaveBeenCalled();
    expect(
      deleteTransaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload,
    ).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: BOY_ID,
      recipientId: BOY_ID,
      version: 2,
    });

    const reorderedDraft = note({
      status: "DRAFT",
      showAt: null,
      position: 0,
      version: 2,
    });
    const reorderTransaction = {
      note: {
        findMany: vi.fn().mockResolvedValue([draft]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "event" }),
      },
    };
    const reorderService = new NotesService(
      {
        $transaction: vi.fn(async (operation) => operation(reorderTransaction)),
        note: { findMany: vi.fn().mockResolvedValue([reorderedDraft]) },
        reaction: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      identities(),
      clock(),
    );

    await reorderService.reorder("boy", {
      items: [
        {
          id: NOTE_ID,
          version: 1,
          position: 0,
          isPinned: false,
        },
      ],
    });

    expect(
      reorderTransaction.outboxEvent.upsert.mock.calls[0]?.[0].create.payload,
    ).toMatchObject({
      aggregateId: NOTE_ID,
      actorId: BOY_ID,
      recipientId: BOY_ID,
      version: 2,
    });
  });

  it("never restores disappear-after-view or expired content to the recipient archive", async () => {
    const recipient = {
      ...actor,
      role: "girl" as const,
      user: actor.couple.members[1]!,
    } as IdentityResponse;
    const findMany = vi.fn().mockResolvedValue([
      note({
        status: "ARCHIVED",
        showAt: null,
        visibleAt: NOW,
        keepAfterViewed: false,
        viewedAt: null,
        archivedAt: NOW,
      }),
      note({
        id: "70000000-0000-4000-8000-000000000002",
        status: "VISIBLE",
        showAt: null,
        visibleAt: NOW,
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    ]);
    const service = new NotesService(
      {
        note: { findMany },
        reaction: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService,
      identities(recipient),
      clock(),
    );

    const result = await service.list("girl", {
      scope: "received",
      includeArchived: true,
    });

    expect(result.items).toEqual([]);
  });

  it("returns not found instead of serializing an expired note to its recipient", async () => {
    const recipient = {
      ...actor,
      role: "girl" as const,
      user: actor.couple.members[1]!,
    } as IdentityResponse;
    const service = new NotesService(
      {
        note: {
          findFirst: vi.fn().mockResolvedValue(
            note({
              status: "VISIBLE",
              showAt: null,
              visibleAt: NOW,
              expiresAt: new Date(NOW.getTime() - 1),
            }),
          ),
        },
      } as unknown as PrismaService,
      identities(recipient),
      clock(),
    );

    await expect(service.get("girl", NOTE_ID)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 404,
    );
  });
});
