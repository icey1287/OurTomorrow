import { HttpException } from "@nestjs/common";
import { CalmLetterPurpose, CalmLetterStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit/audit.service";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import {
  calmLetterContentSelect,
  calmLetterMetadataSelect,
} from "./calm-letter.presentation";
import {
  calmLetterUnlockEventKey,
  CalmLettersService,
} from "./calm-letters.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const LETTER_ID = "61000000-0000-4000-8000-000000000001";
const OUTBOX_ID = "61000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-17T08:30:00.000Z");
const FUTURE = new Date("2026-07-17T10:30:00.000Z");
const SECRET = "这段正文只该在规则允许时出现。";

const boy = {
  id: BOY_ID,
  version: 1,
  displayName: "甲",
  slot: 1 as const,
  role: "boy" as const,
  nicknameInRelationship: "甲",
  avatarUrl: null,
};

const girl = {
  id: GIRL_ID,
  version: 1,
  displayName: "乙",
  slot: 2 as const,
  role: "girl" as const,
  nicknameInRelationship: "乙",
  avatarUrl: null,
};

function actor(role: "boy" | "girl") {
  return {
    role,
    user: role === "boy" ? boy : girl,
    couple: {
      id: COUPLE_ID,
      version: 1,
      name: "我们的明天",
      startDate: "2024-01-01",
      timezone: "Asia/Shanghai",
      signature: null,
      theme: "system" as const,
      members: [boy, girl],
    },
  };
}

function identityService(): IdentityService {
  return {
    current: vi.fn(async (role: "boy" | "girl") => actor(role)),
  } as unknown as IdentityService;
}

function clock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function auditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function letter(
  overrides: Partial<{
    authorId: string;
    recipientId: string;
    status: CalmLetterStatus;
    version: number;
    unlockAt: Date | null;
    openedAt: Date | null;
  }> = {},
) {
  return {
    id: LETTER_ID,
    coupleId: COUPLE_ID,
    authorId: BOY_ID,
    recipientId: GIRL_ID,
    purpose: CalmLetterPurpose.BE_HEARD,
    status: CalmLetterStatus.LOCKED,
    version: 1,
    unlockAt: FUTURE,
    sentAt: NOW,
    openedAt: null,
    createdAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function eventStores() {
  return {
    notification: {
      upsert: vi.fn().mockResolvedValue({ id: "notification" }),
    },
    outboxEvent: {
      upsert: vi.fn().mockResolvedValue({ id: OUTBOX_ID }),
    },
    scheduledEvent: {
      upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn() },
  };
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("CalmLettersService privacy", () => {
  it("lists metadata without selecting or serializing any body", async () => {
    const visible = letter();
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([visible]);
    const service = new CalmLettersService(
      { calmLetter: { findMany } } as unknown as PrismaService,
      identityService(),
      clock(),
      auditService(),
    );

    const result = await service.list("girl");

    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ select: calmLetterMetadataSelect }),
    );
    expect(calmLetterMetadataSelect).not.toHaveProperty("content");
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result[0]).toMatchObject({
      direction: "RECEIVED",
      bodyAvailable: false,
      canOpen: false,
    });
  });

  it("never queries the body for a locked recipient", async () => {
    const metadata = letter();
    const findFirst = vi.fn().mockResolvedValue(metadata);
    const tx = { calmLetter: { findFirst } };
    const prisma = {
      calmLetter: { findFirst },
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      auditService(),
    );

    const result = await service.get("girl", LETTER_ID);

    expect(findFirst).toHaveBeenCalledTimes(2);
    for (const call of findFirst.mock.calls) {
      expect(call[0].select).toEqual(calmLetterMetadataSelect);
      expect(call[0].select).not.toHaveProperty("content");
    }
    expect(result.bodyAvailable).toBe(false);
    expect(result).not.toHaveProperty("content");
  });

  it("lets the author read their own locked body through a separate query", async () => {
    const metadata = letter();
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce({ id: LETTER_ID, content: SECRET });
    const tx = { calmLetter: { findFirst } };
    const prisma = {
      calmLetter: { findFirst },
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      auditService(),
    );

    const result = await service.get("boy", LETTER_ID);

    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ select: calmLetterContentSelect }),
    );
    expect(result).toMatchObject({ bodyAvailable: true, content: SECRET });
  });

  it("creates a locked letter with a durable unlock job and generic events", async () => {
    const stores = eventStores();
    const tx = {
      calmLetter: {
        create: vi.fn(async ({ data }: { data: { id: string } }) => ({
          id: data.id,
          version: 1,
        })),
      },
      ...stores,
    };
    const outsideFindFirst = vi
      .fn()
      .mockResolvedValueOnce(letter())
      .mockResolvedValueOnce({ id: LETTER_ID, content: SECRET });
    const prisma = {
      calmLetter: { findFirst: outsideFindFirst },
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      auditService(),
    );

    const result = await service.create("boy", {
      purpose: CalmLetterPurpose.BE_HEARD,
      content: SECRET,
      unlockAt: FUTURE.toISOString(),
    });

    expect(tx.calmLetter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: BOY_ID,
          recipientId: GIRL_ID,
          status: CalmLetterStatus.LOCKED,
          unlockAt: FUTURE,
        }),
      }),
    );
    const createdId = tx.calmLetter.create.mock.calls[0]?.[0].data.id as string;
    expect(createdId).toEqual(expect.any(String));
    expect(tx.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          dedupeKey: calmLetterUnlockEventKey(createdId),
          type: "CALM_LETTER_UNLOCK",
          payload: { calmLetterId: createdId },
          runAt: FUTURE,
        }),
      }),
    );
    expect(JSON.stringify(tx.notification.upsert.mock.calls)).not.toContain(
      SECRET,
    );
    expect(JSON.stringify(tx.outboxEvent.upsert.mock.calls)).not.toContain(
      SECRET,
    );
    expect(result.content).toBe(SECRET);
  });

  it("rejects recipient open before server time without ever selecting content", async () => {
    const stores = eventStores();
    const findFirst = vi.fn().mockResolvedValue(letter());
    const tx = {
      calmLetter: {
        findFirst,
        updateMany: vi.fn(),
      },
      ...stores,
    };
    const prisma = {
      calmLetter: { findFirst: vi.fn() },
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      auditService(),
    );

    await expect(
      service.open("girl", LETTER_ID, { version: 1 }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 423);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: calmLetterMetadataSelect }),
    );
    expect(tx.calmLetter.updateMany).not.toHaveBeenCalled();
    expect(prisma.calmLetter.findFirst).not.toHaveBeenCalled();
  });

  it("opens an available letter, audits metadata only, then loads the body", async () => {
    const available = letter({
      status: CalmLetterStatus.AVAILABLE,
      unlockAt: NOW,
      version: 2,
    });
    const opened = letter({
      status: CalmLetterStatus.OPENED,
      unlockAt: NOW,
      openedAt: NOW,
      version: 3,
    });
    const stores = eventStores();
    const tx = {
      calmLetter: {
        findFirst: vi.fn().mockResolvedValue(available),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ...stores,
    };
    const outsideFindFirst = vi
      .fn()
      .mockResolvedValueOnce(opened)
      .mockResolvedValueOnce({ id: LETTER_ID, content: SECRET });
    const audit = auditService();
    const prisma = {
      calmLetter: { findFirst: outsideFindFirst },
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      audit,
    );

    const result = await service.open("girl", LETTER_ID, { version: 2 });

    expect(tx.calmLetter.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientId: GIRL_ID,
          status: CalmLetterStatus.AVAILABLE,
          version: 2,
        }),
        data: {
          status: CalmLetterStatus.OPENED,
          openedAt: NOW,
          version: { increment: 1 },
        },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CALM_LETTER_OPENED",
        actorId: GIRL_ID,
        resourceId: LETTER_ID,
        metadata: {
          resourceId: LETTER_ID,
          status: CalmLetterStatus.OPENED,
          version: 3,
        },
      }),
      tx,
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(SECRET);
    expect(JSON.stringify(tx.notification.upsert.mock.calls)).not.toContain(
      SECRET,
    );
    expect(JSON.stringify(tx.outboxEvent.upsert.mock.calls)).not.toContain(
      SECRET,
    );
    expect(outsideFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ select: calmLetterContentSelect }),
    );
    expect(result.content).toBe(SECRET);
  });

  it("materializes a due letter idempotently without reading its body", async () => {
    const due = letter({ unlockAt: NOW });
    const stores = eventStores();
    const tx = {
      calmLetter: {
        findFirst: vi.fn().mockResolvedValue(due),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      ...stores,
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(tx)),
    } as unknown as PrismaService;
    const service = new CalmLettersService(
      prisma,
      identityService(),
      clock(),
      auditService(),
    );

    await service.materializeUnlock(COUPLE_ID, LETTER_ID, NOW);

    expect(tx.calmLetter.findFirst).toHaveBeenCalledWith({
      where: { id: LETTER_ID, coupleId: COUPLE_ID, deletedAt: null },
      select: calmLetterMetadataSelect,
    });
    expect(tx.calmLetter.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: CalmLetterStatus.AVAILABLE,
          version: { increment: 1 },
        },
      }),
    );
    expect(JSON.stringify(tx.outboxEvent.upsert.mock.calls)).not.toContain(
      SECRET,
    );
  });
});
