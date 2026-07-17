import { HttpException } from "@nestjs/common";
import { DailyEntryStatus, Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import {
  DAILY_PROMPT_QUESTIONS,
  DailyEntriesService,
} from "./daily-entries.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const PROMPT_ID = "30000000-0000-4000-8000-000000000001";
const BOY_ENTRY_ID = "31000000-0000-4000-8000-000000000001";
const GIRL_ENTRY_ID = "31000000-0000-4000-8000-000000000002";
const LOCAL_DATE = "2026-07-17";
const ENTRY_DATE = new Date(`${LOCAL_DATE}T00:00:00.000Z`);
const NOW = new Date("2026-07-17T12:34:56.000Z");

const actor = {
  role: "boy" as const,
  user: {
    id: BOY_ID,
    version: 1,
    displayName: "甲",
    slot: 1 as const,
    role: "boy" as const,
    nicknameInRelationship: "甲",
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
        nicknameInRelationship: "甲",
        avatarUrl: null,
      },
      {
        id: GIRL_ID,
        version: 1,
        displayName: "乙",
        slot: 2 as const,
        role: "girl" as const,
        nicknameInRelationship: "乙",
        avatarUrl: null,
      },
    ],
  },
};

function prompt() {
  return {
    id: PROMPT_ID,
    promptDate: ENTRY_DATE,
    question: "今天什么时候想起了对方？",
  };
}

function ownEntry(
  status: DailyEntryStatus,
  version = 1,
  answer = "下班看到晚霞时。",
) {
  const revealed = status === DailyEntryStatus.REVEALED;
  return {
    id: BOY_ENTRY_ID,
    content: answer,
    postscript: null,
    status,
    version,
    submittedAt:
      status === DailyEntryStatus.DRAFT || status === DailyEntryStatus.EDITING
        ? null
        : NOW,
    revealedAt: revealed ? NOW : null,
  };
}

function partnerMetadata(status: DailyEntryStatus, version = 2) {
  const submitted = !(
    [DailyEntryStatus.DRAFT, DailyEntryStatus.EDITING] as DailyEntryStatus[]
  ).includes(status);
  return {
    id: GIRL_ENTRY_ID,
    authorId: GIRL_ID,
    status,
    version,
    submittedAt: submitted ? NOW : null,
    revealedAt: status === DailyEntryStatus.REVEALED ? NOW : null,
  };
}

function fixedClock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(() => LOCAL_DATE),
  } as unknown as Clock;
}

function identities(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

describe("DailyEntriesService", () => {
  it("rotates a fixed prompt deterministically and upserts by couple-local date", async () => {
    const upsert = vi.fn(
      async ({ create }: { create: { question: string } }) => ({
        ...prompt(),
        question: create.question,
      }),
    );
    const service = new DailyEntriesService(
      { dailyPrompt: { upsert } } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const first = await service.ensurePrompt(COUPLE_ID, "2026-07-17");
    const repeated = await service.ensurePrompt(COUPLE_ID, "2026-07-17");
    const tomorrow = await service.ensurePrompt(COUPLE_ID, "2026-07-18");

    expect(first.question).toBe(repeated.question);
    expect(tomorrow.question).not.toBe(first.question);
    expect(DAILY_PROMPT_QUESTIONS).toContain(first.question);
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          coupleId_promptDate: { coupleId: COUPLE_ID, promptDate: ENTRY_DATE },
        },
        update: {},
      }),
    );
  });

  it("derives today in the couple timezone and never loads a waiting partner answer", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(ownEntry(DailyEntryStatus.WAITING_FOR_PARTNER, 2))
      .mockResolvedValueOnce(partnerMetadata(DailyEntryStatus.EDITING));
    const clock = fixedClock();
    const service = new DailyEntriesService(
      {
        dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
        dailyEntry: { findFirst },
      } as unknown as PrismaService,
      identities(),
      clock,
    );

    const result = await service.today("boy");

    expect(clock.localDate).toHaveBeenCalledWith("Asia/Shanghai", NOW);
    expect(result).toMatchObject({
      date: LOCAL_DATE,
      timezone: "Asia/Shanghai",
      status: DailyEntryStatus.WAITING_FOR_PARTNER,
      partner: { submitted: false },
    });
    expect(result.partner).toEqual({ submitted: false });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({ authorId: GIRL_ID }),
        select: {
          id: true,
          authorId: true,
          status: true,
          version: true,
          submittedAt: true,
          revealedAt: true,
        },
      }),
    );
    expect(findFirst.mock.calls[1]?.[0]?.select).not.toHaveProperty("content");
    expect(findFirst.mock.calls[1]?.[0]?.select).not.toHaveProperty(
      "postscript",
    );
  });

  it("exposes only submitted=true when the partner is waiting", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(ownEntry(DailyEntryStatus.EDITING))
      .mockResolvedValueOnce(
        partnerMetadata(DailyEntryStatus.WAITING_FOR_PARTNER),
      );
    const service = new DailyEntriesService(
      {
        dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
        dailyEntry: { findFirst },
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const result = await service.today("boy");

    expect(result.status).toBe(DailyEntryStatus.EDITING);
    expect(result.partner).toEqual({ submitted: true });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("keeps the first submission waiting without creating a reveal event", async () => {
    const transaction = {
      dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
      dailyEntry: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(ownEntry(DailyEntryStatus.EDITING, 4))
          .mockResolvedValueOnce(partnerMetadata(DailyEntryStatus.EDITING, 3)),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { upsert: vi.fn() },
      outboxEvent: { upsert: vi.fn() },
      scheduledEvent: { upsert: vi.fn() },
    };
    const readFindFirst = vi
      .fn()
      .mockResolvedValueOnce(ownEntry(DailyEntryStatus.WAITING_FOR_PARTNER, 5))
      .mockResolvedValueOnce(partnerMetadata(DailyEntryStatus.EDITING, 3));
    const runTransaction = vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    );
    const service = new DailyEntriesService(
      {
        $transaction: runTransaction,
        dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
        dailyEntry: { findFirst: readFindFirst },
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const result = await service.submitToday("boy", { version: 4 });

    expect(result.status).toBe(DailyEntryStatus.WAITING_FOR_PARTNER);
    expect(transaction.dailyEntry.updateMany).toHaveBeenCalledOnce();
    expect(transaction.dailyEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: BOY_ID,
          version: 4,
        }),
        data: expect.objectContaining({
          status: DailyEntryStatus.WAITING_FOR_PARTNER,
          submittedAt: NOW,
          version: { increment: 1 },
        }),
      }),
    );
    expect(transaction.notification.upsert).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.upsert).not.toHaveBeenCalled();
  });

  it("atomically reveals both entries on the second Serializable submission", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
      dailyEntry: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(
            ownEntry(DailyEntryStatus.EDITING, 7, "我的秘密"),
          )
          .mockResolvedValueOnce(
            partnerMetadata(DailyEntryStatus.WAITING_FOR_PARTNER, 5),
          ),
        updateMany,
      },
      notification: {
        upsert: vi.fn().mockResolvedValue({ id: "notification" }),
      },
      outboxEvent: {
        upsert: vi.fn().mockResolvedValue({
          id: "32000000-0000-4000-8000-000000000001",
        }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "scheduled" }),
      },
    };
    const readFindFirst = vi
      .fn()
      .mockResolvedValueOnce(ownEntry(DailyEntryStatus.REVEALED, 8, "我的秘密"))
      .mockResolvedValueOnce(partnerMetadata(DailyEntryStatus.REVEALED, 6))
      .mockResolvedValueOnce({
        content: "对方的秘密",
        postscript: null,
        submittedAt: NOW,
        revealedAt: NOW,
      });
    const runTransaction = vi.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    );
    const service = new DailyEntriesService(
      {
        $transaction: runTransaction,
        dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
        dailyEntry: { findFirst: readFindFirst },
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const result = await service.submitToday("boy", { version: 7 });

    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: GIRL_ENTRY_ID,
          authorId: GIRL_ID,
          version: 5,
        }),
        data: expect.objectContaining({
          status: DailyEntryStatus.REVEALED,
          revealedAt: NOW,
          lockedAt: NOW,
        }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: BOY_ENTRY_ID,
          authorId: BOY_ID,
          version: 7,
        }),
        data: expect.objectContaining({
          status: DailyEntryStatus.REVEALED,
          submittedAt: NOW,
          revealedAt: NOW,
          lockedAt: NOW,
        }),
      }),
    );
    expect(result.partner).toEqual({
      submitted: true,
      answer: "对方的秘密",
      postscript: null,
      submittedAt: NOW.toISOString(),
      revealedAt: NOW.toISOString(),
    });

    const notificationCall = transaction.notification.upsert.mock.calls[0]?.[0];
    const outboxCall = transaction.outboxEvent.upsert.mock.calls[0]?.[0];
    expect(notificationCall?.create.payload).toEqual({
      resourceType: "DailyPrompt",
      resourceId: PROMPT_ID,
    });
    expect(outboxCall?.create).toMatchObject({
      aggregateId: PROMPT_ID,
      eventType: "daily-entry.revealed",
      payload: {
        aggregateId: PROMPT_ID,
        occurredAt: NOW.toISOString(),
      },
    });
    expect(JSON.stringify([notificationCall, outboxCall])).not.toContain(
      "秘密",
    );
  });

  it("returns a version conflict when a conditional draft update loses a race", async () => {
    const transaction = {
      dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
      dailyEntry: {
        findFirst: vi
          .fn()
          .mockResolvedValue(partnerMetadata(DailyEntryStatus.EDITING, 3)),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new DailyEntriesService(
      {
        $transaction: vi.fn(
          async (operation: (client: typeof transaction) => Promise<unknown>) =>
            operation(transaction),
        ),
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    await expect(
      service.saveToday("boy", { answer: "并发保存", version: 3 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 409,
    );
  });

  it("locks the revealed answer while allowing only the author's versioned postscript", async () => {
    const lockedTransaction = {
      dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
      dailyEntry: {
        findFirst: vi
          .fn()
          .mockResolvedValue(partnerMetadata(DailyEntryStatus.REVEALED, 9)),
      },
    };
    const lockedService = new DailyEntriesService(
      {
        $transaction: vi.fn(
          async (
            operation: (client: typeof lockedTransaction) => Promise<unknown>,
          ) => operation(lockedTransaction),
        ),
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );
    await expect(
      lockedService.saveToday("boy", { answer: "试图改正文", version: 9 }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpException && error.getStatus() === 423,
    );

    const postscriptUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const postscriptTransaction = {
      dailyEntry: {
        findFirst: vi.fn().mockResolvedValue({
          ...partnerMetadata(DailyEntryStatus.REVEALED, 9),
          id: BOY_ENTRY_ID,
          authorId: BOY_ID,
        }),
        updateMany: postscriptUpdate,
      },
    };
    const readFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        ...ownEntry(DailyEntryStatus.REVEALED, 10),
        postscript: "晚霞真的很好看。",
      })
      .mockResolvedValueOnce(partnerMetadata(DailyEntryStatus.REVEALED, 6))
      .mockResolvedValueOnce({
        content: "我也看到了。",
        postscript: null,
        submittedAt: NOW,
        revealedAt: NOW,
      });
    const postscriptService = new DailyEntriesService(
      {
        $transaction: vi.fn(
          async (
            operation: (
              client: typeof postscriptTransaction,
            ) => Promise<unknown>,
          ) => operation(postscriptTransaction),
        ),
        dailyPrompt: { upsert: vi.fn().mockResolvedValue(prompt()) },
        dailyEntry: { findFirst: readFindFirst },
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const result = await postscriptService.addPostscript("boy", {
      postscript: "晚霞真的很好看。",
      version: 9,
    });

    expect(postscriptUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: BOY_ENTRY_ID,
          authorId: BOY_ID,
          version: 9,
          status: DailyEntryStatus.REVEALED,
        }),
        data: {
          postscript: "晚霞真的很好看。",
          version: { increment: 1 },
        },
      }),
    );
    expect(result.mine?.postscript).toBe("晚霞真的很好看。");
  });

  it("builds the calendar from metadata-only entry selections", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        promptDate: ENTRY_DATE,
        entries: [
          { authorId: BOY_ID, status: DailyEntryStatus.WAITING_FOR_PARTNER },
          { authorId: GIRL_ID, status: DailyEntryStatus.EDITING },
        ],
      },
    ]);
    const service = new DailyEntriesService(
      {
        dailyPrompt: {
          upsert: vi.fn().mockResolvedValue(prompt()),
          findMany,
        },
      } as unknown as PrismaService,
      identities(),
      fixedClock(),
    );

    const result = await service.calendar("boy", "2026-07");

    expect(result.days).toEqual([
      {
        date: LOCAL_DATE,
        status: DailyEntryStatus.WAITING_FOR_PARTNER,
        mineSubmitted: true,
        partnerSubmitted: false,
        revealed: false,
      },
    ]);
    const entrySelect = findMany.mock.calls[0]?.[0]?.select?.entries?.select;
    expect(entrySelect).toEqual({ authorId: true, status: true });
    expect(entrySelect).not.toHaveProperty("content");
    expect(entrySelect).not.toHaveProperty("postscript");
  });
});
