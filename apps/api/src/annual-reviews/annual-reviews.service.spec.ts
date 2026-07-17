import { HttpException } from "@nestjs/common";
import { AnnualReviewStatus, MediaStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuditService } from "../common/audit/audit.service";
import type { Clock } from "../common/clock/clock";
import type { PrismaService } from "../database/prisma.service";
import type { IdentityService } from "../identity/identity.service";
import { AnnualReviewsService } from "./annual-reviews.service";

const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";
const REVIEW_ID = "70000000-0000-4000-8000-000000000001";
const MEDIA_ID = "80000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-17T08:30:00.000Z");

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
const actor = {
  role: "boy" as const,
  user: boy,
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

function clock(): Clock {
  return {
    now: vi.fn(() => NOW),
    localDate: vi.fn(),
  } as unknown as Clock;
}

function identityService(): IdentityService {
  return {
    current: vi.fn().mockResolvedValue(actor),
  } as unknown as IdentityService;
}

function review(status: AnnualReviewStatus) {
  return {
    id: REVIEW_ID,
    coupleId: COUPLE_ID,
    year: 2026,
    status,
    version: 1,
    statistics: {},
    keywords: [],
    nextYearLetter: null,
    createdAt: NOW,
    updatedAt: NOW,
    publishedAt: status === AnnualReviewStatus.PUBLISHED ? NOW : null,
    contributions: [],
  };
}

function service(prisma: PrismaService) {
  return new AnnualReviewsService(prisma, identityService(), clock(), {
    record: vi.fn(),
  } as unknown as AuditService);
}

function statusCode(error: unknown): number | undefined {
  return error instanceof HttpException ? error.getStatus() : undefined;
}

describe("AnnualReviewsService", () => {
  it("lists only ready images attached to published memories in the selected year", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: MEDIA_ID,
        originalName: "summer.jpg",
        mimeType: "image/jpeg",
        size: 1_024n,
        width: 1200,
        height: 800,
        status: MediaStatus.READY,
        createdAt: NOW,
        deletedAt: null,
      },
    ]);

    const result = await service({
      mediaAsset: { findMany },
    } as unknown as PrismaService).mediaOptions("boy", 2026);

    expect(result).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          status: MediaStatus.READY,
          OR: expect.arrayContaining([
            expect.objectContaining({
              usedAsMemoryCover: expect.objectContaining({
                some: expect.objectContaining({
                  coupleId: COUPLE_ID,
                  status: "PUBLISHED",
                  happenedAt: expect.objectContaining({
                    gte: expect.any(Date),
                    lt: expect.any(Date),
                  }),
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("revalidates the selected photo inside the serializable update transaction", async () => {
    const transaction = {
      annualReview: {
        findUnique: vi.fn().mockResolvedValue({
          id: REVIEW_ID,
          status: AnnualReviewStatus.READY,
        }),
        updateMany: vi.fn(),
      },
      mediaAsset: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;

    await expect(
      service(prisma).update("boy", 2026, {
        version: 1,
        selectedMediaId: MEDIA_ID,
      }),
    ).rejects.toSatisfy((error: unknown) => statusCode(error) === 400);

    expect(transaction.mediaAsset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: MEDIA_ID,
          coupleId: COUPLE_ID,
          OR: expect.any(Array),
        }),
      }),
    );
    expect(transaction.annualReview.updateMany).not.toHaveBeenCalled();
  });

  it("queues a fresh generation for an unpublished ready review", async () => {
    const transaction = {
      annualReview: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: REVIEW_ID,
            status: AnnualReviewStatus.READY,
          })
          .mockResolvedValueOnce(review(AnnualReviewStatus.GENERATING)),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: REVIEW_ID }),
      },
      scheduledEvent: {
        upsert: vi.fn().mockResolvedValue({ id: "annual-review-job" }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;

    const result = await service(prisma).request("boy", 2026);

    expect(result.status).toBe(AnnualReviewStatus.GENERATING);
    expect(transaction.annualReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REVIEW_ID },
        data: { status: AnnualReviewStatus.GENERATING },
      }),
    );
    expect(transaction.scheduledEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          coupleId: COUPLE_ID,
          type: "ANNUAL_REVIEW",
          payload: { annualReviewId: REVIEW_ID },
        }),
      }),
    );
  });

  it("keeps a published review frozen and does not enqueue regeneration", async () => {
    const published = review(AnnualReviewStatus.PUBLISHED);
    const transaction = {
      annualReview: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: REVIEW_ID,
            status: AnnualReviewStatus.PUBLISHED,
          })
          .mockResolvedValueOnce(published),
        create: vi.fn(),
        update: vi.fn(),
      },
      scheduledEvent: { upsert: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;

    const result = await service(prisma).request("boy", 2026);

    expect(result.status).toBe(AnnualReviewStatus.PUBLISHED);
    expect(transaction.annualReview.update).not.toHaveBeenCalled();
    expect(transaction.scheduledEvent.upsert).not.toHaveBeenCalled();
  });
});
