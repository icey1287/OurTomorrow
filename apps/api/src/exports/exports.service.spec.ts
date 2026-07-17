import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { ExportFormat } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "../common/clock/system-clock";
import type { Environment } from "../config/env.schema";
import { resolveStoragePath } from "../media/media-storage";
import { ExportsService } from "./exports.service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fileSystem.rm(root, { recursive: true, force: true })),
  );
});

async function service(prisma?: unknown): Promise<{
  exportsService: ExportsService;
  root: string;
}> {
  const root = await fileSystem.mkdtemp(
    path.join(os.tmpdir(), "our-tomorrow-export-"),
  );
  roots.push(root);
  const config = {
    get(key: keyof Environment) {
      if (key === "MEDIA_STORAGE_PATH") return root;
      throw new Error(`Unexpected config key ${key}`);
    },
  } as unknown as ConfigService<Environment, true>;
  return {
    root,
    exportsService: new ExportsService(
      prisma as never,
      undefined as never,
      undefined as never,
      new SystemClock(),
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      config,
    ),
  };
}

function collector(exportsService: ExportsService) {
  return exportsService as unknown as {
    collectPlaces(coupleId: string): Promise<unknown[]>;
    collectStageSix(
      coupleId: string,
      userId: string,
      visibleMemoryIds: ReadonlySet<string>,
    ): Promise<{
      touchEvents: Array<Record<string, unknown>>;
      calmLetters: Array<Record<string, unknown>>;
      memoryResurfaces: Array<Record<string, unknown>>;
      annualReviews: Array<{
        contributions: Array<Record<string, unknown>>;
      }>;
    }>;
  };
}

function writer(exportsService: ExportsService) {
  return exportsService as unknown as {
    writeExport(
      exportId: string,
      format: ExportFormat,
      data: Record<string, unknown>,
      media: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        size: bigint;
        checksumSha256: string | null;
        storageKey: string;
      }>,
    ): Promise<{ storageKey: string; checksum: string }>;
  };
}

describe("ExportsService package writer", () => {
  it("creates an atomic ZIP with versioned metadata and safe media paths", async () => {
    const { exportsService, root } = await service();
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const storageKey = `media/11/${mediaId}/original.webp`;
    const source = resolveStoragePath(root, storageKey);
    await fileSystem.mkdir(path.dirname(source), { recursive: true });
    await fileSystem.writeFile(source, Buffer.from("private-image"));

    const result = await writer(exportsService).writeExport(
      "22222222-2222-4222-8222-222222222222",
      ExportFormat.ZIP,
      { format: "our-tomorrow-data", version: 1, note: "private-note" },
      [
        {
          id: mediaId,
          originalName: "../海边/照片.webp",
          mimeType: "image/webp",
          size: 13n,
          checksumSha256: null,
          storageKey,
        },
      ],
    );

    const output = resolveStoragePath(root, result.storageKey);
    const bytes = await fileSystem.readFile(output);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const archiveIndex = bytes.toString("latin1");
    expect(archiveIndex).toContain("manifest.json");
    expect(archiveIndex).toContain("data.json");
    expect(archiveIndex).toContain(`media/${mediaId}/`);
    expect(archiveIndex).toContain(".webp");
    expect(archiveIndex).not.toContain("../");
    expect(archiveIndex).not.toContain(storageKey);
    expect(result.checksum).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(
      (await fileSystem.readdir(path.join(root, "exports"))).some((name) =>
        name.endsWith(".part"),
      ),
    ).toBe(false);
  });

  it("keeps internal storage keys out of JSON exports", async () => {
    const { exportsService, root } = await service();
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const storageKey = `media/11/${mediaId}/original.webp`;
    const source = resolveStoragePath(root, storageKey);
    await fileSystem.mkdir(path.dirname(source), { recursive: true });
    await fileSystem.writeFile(source, Buffer.from("private-image"));

    const result = await writer(exportsService).writeExport(
      "33333333-3333-4333-8333-333333333333",
      ExportFormat.JSON,
      { format: "our-tomorrow-data", version: 1 },
      [
        {
          id: mediaId,
          originalName: "photo.webp",
          mimeType: "image/webp",
          size: 13n,
          checksumSha256: "checksum",
          storageKey,
        },
      ],
    );

    const body = await fileSystem.readFile(
      resolveStoragePath(root, result.storageKey),
      "utf8",
    );
    expect(body).toContain(`media/${mediaId}/photo.webp`);
    expect(body).not.toContain(storageKey);
  });
});

describe("ExportsService stage six collector", () => {
  const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
  const USER_ID = "00000000-0000-4000-8000-000000000101";
  const PARTNER_ID = "00000000-0000-4000-8000-000000000102";
  const VISIBLE_MEMORY_ID = "10000000-0000-4000-8000-000000000001";
  const HIDDEN_MEMORY_ID = "10000000-0000-4000-8000-000000000002";
  const READABLE_MEDIA_ID = "20000000-0000-4000-8000-000000000001";
  const HIDDEN_MEDIA_ID = "20000000-0000-4000-8000-000000000002";
  const NOW = new Date("2026-07-17T08:00:00.000Z");

  it("includes both place state axes in a couple-scoped export query", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "30000000-0000-4000-8000-000000000001",
        historyState: "VISITED",
        futureState: "PLANNED",
      },
    ]);
    const { exportsService } = await service({ place: { findMany } });

    const places = await collector(exportsService).collectPlaces(COUPLE_ID);

    expect(places).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { coupleId: COUPLE_ID, deletedAt: null },
        select: expect.objectContaining({
          historyState: true,
          futureState: true,
        }),
      }),
    );
  });

  it("exports stage six records without crossing content visibility boundaries", async () => {
    const touchFindMany = vi.fn().mockResolvedValue([
      {
        id: "40000000-0000-4000-8000-000000000001",
        senderId: USER_ID,
        recipientId: PARTNER_ID,
        kind: "HUG",
        message: "抱一下",
        createdAt: NOW,
        deliveredAt: NOW,
        readAt: null,
      },
    ]);
    const calmFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "50000000-0000-4000-8000-000000000001",
          authorId: USER_ID,
          recipientId: PARTNER_ID,
          purpose: "BE_HEARD",
          status: "DRAFT",
          version: 1,
          content: "作者草稿正文",
          unlockAt: null,
          sentAt: null,
          openedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "50000000-0000-4000-8000-000000000002",
          authorId: PARTNER_ID,
          recipientId: USER_ID,
          purpose: "DISCUSS_LATER",
          status: "LOCKED",
          version: 2,
          content: "未打开的收件正文",
          unlockAt: NOW,
          sentAt: NOW,
          openedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: "50000000-0000-4000-8000-000000000003",
          authorId: PARTNER_ID,
          recipientId: USER_ID,
          purpose: "READY_TO_OPEN",
          status: "OPENED",
          version: 3,
          content: "已经打开的正文",
          unlockAt: NOW,
          sentAt: NOW,
          openedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "50000000-0000-4000-8000-000000000001",
          content: "作者草稿正文",
        },
        {
          id: "50000000-0000-4000-8000-000000000003",
          content: "已经打开的正文",
        },
      ]);
    const resurfaceFindMany = vi.fn().mockResolvedValue([
      {
        id: "60000000-0000-4000-8000-000000000001",
        memoryId: VISIBLE_MEMORY_ID,
        localDate: new Date("2026-07-16T00:00:00.000Z"),
        reason: "ON_THIS_DAY",
        displayedAt: NOW,
        openedAt: null,
        dismissedAt: null,
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        memoryId: VISIBLE_MEMORY_ID,
        localDate: new Date("2026-07-17T00:00:00.000Z"),
        reason: "RANDOM",
        displayedAt: NOW,
        openedAt: NOW,
        dismissedAt: null,
      },
      {
        id: "60000000-0000-4000-8000-000000000003",
        memoryId: HIDDEN_MEMORY_ID,
        localDate: new Date("2026-07-18T00:00:00.000Z"),
        reason: "PLACE",
        displayedAt: NOW,
        openedAt: NOW,
        dismissedAt: null,
      },
    ]);
    const annualFindMany = vi.fn().mockResolvedValue([
      {
        id: "70000000-0000-4000-8000-000000000001",
        year: 2026,
        status: "READY",
        version: 1,
        statistics: { memories: 12 },
        keywords: ["海边"],
        nextYearLetter: "明年也一起走",
        createdAt: NOW,
        updatedAt: NOW,
        publishedAt: null,
        contributions: [
          {
            id: "80000000-0000-4000-8000-000000000001",
            authorId: USER_ID,
            selectedMediaId: READABLE_MEDIA_ID,
            message: "我的年度照片",
            updatedAt: NOW,
          },
          {
            id: "80000000-0000-4000-8000-000000000002",
            authorId: PARTNER_ID,
            selectedMediaId: HIDDEN_MEDIA_ID,
            message: "对方的年度寄语",
            updatedAt: NOW,
          },
        ],
      },
    ]);
    const mediaFindMany = vi
      .fn()
      .mockResolvedValue([{ id: READABLE_MEDIA_ID }]);
    const prisma = {
      touchEvent: { findMany: touchFindMany },
      calmLetter: { findMany: calmFindMany },
      memoryResurface: { findMany: resurfaceFindMany },
      annualReview: { findMany: annualFindMany },
      mediaAsset: { findMany: mediaFindMany },
    };
    const { exportsService } = await service(prisma);

    const result = await collector(exportsService).collectStageSix(
      COUPLE_ID,
      USER_ID,
      new Set([VISIBLE_MEMORY_ID]),
    );

    for (const findMany of [
      touchFindMany,
      calmFindMany,
      resurfaceFindMany,
      annualFindMany,
    ]) {
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ coupleId: COUPLE_ID }),
        }),
      );
    }
    expect(calmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              recipientId: USER_ID,
              status: { not: "DRAFT" },
            },
          ]),
        }),
      }),
    );
    expect(calmFindMany.mock.calls[0]?.[0].select).not.toHaveProperty(
      "content",
    );
    expect(calmFindMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          coupleId: COUPLE_ID,
          id: {
            in: [
              "50000000-0000-4000-8000-000000000001",
              "50000000-0000-4000-8000-000000000003",
            ],
          },
        }),
        select: { id: true, content: true },
      }),
    );
    expect(result.touchEvents[0]).toMatchObject({ direction: "SENT" });
    expect(result.touchEvents[0]).not.toHaveProperty("message");
    expect(touchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ message: true }),
      }),
    );
    expect(result.calmLetters.map(({ content }) => content)).toEqual([
      "作者草稿正文",
      null,
      "已经打开的正文",
    ]);
    expect(result.memoryResurfaces.map(({ memoryId }) => memoryId)).toEqual([
      null,
      VISIBLE_MEMORY_ID,
      null,
    ]);
    expect(result.memoryResurfaces[0]).toMatchObject({
      localDate: "2026-07-16",
    });
    expect(
      result.annualReviews[0]?.contributions.map(
        ({ selectedMediaId }) => selectedMediaId,
      ),
    ).toEqual([READABLE_MEDIA_ID, null]);
    expect(mediaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ AND: expect.any(Array) }),
        select: { id: true },
      }),
    );
  });
});
