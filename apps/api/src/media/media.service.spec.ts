import type { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { MediaStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sharp, { type Metadata } from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import { IdentityService } from "../identity/identity.service";
import {
  InvalidImageError,
  InvalidStorageKeyError,
  resolveStoragePath,
  validateImageMetadata,
} from "./media-storage";
import { parseIdempotencyKey } from "./idempotency-key";
import { MediaService } from "./media.service";

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";
const COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const BOY_ID = "00000000-0000-4000-8000-000000000101";
const GIRL_ID = "00000000-0000-4000-8000-000000000102";

const temporaryDirectories: string[] = [];

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-07-16T08:30:00.000Z");
  }

  localDate(): string {
    return "2026-07-16";
  }
}

function identity(userId = BOY_ID) {
  return {
    role: userId === BOY_ID ? ("boy" as const) : ("girl" as const),
    user: {
      id: userId,
      version: 1,
      displayName: userId === BOY_ID ? "甲" : "乙",
      slot: userId === BOY_ID ? (1 as const) : (2 as const),
      role: userId === BOY_ID ? ("boy" as const) : ("girl" as const),
      nicknameInRelationship: userId === BOY_ID ? "甲" : "乙",
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
      members: [],
    },
  };
}

async function temporaryMediaRoot(): Promise<string> {
  const directory = await fileSystem.mkdtemp(
    path.join(tmpdir(), "our-tomorrow-media-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function mediaService(
  prisma: PrismaService,
  identities: IdentityService,
  storageRoot: string,
): MediaService {
  const values = {
    MEDIA_STORAGE_PATH: storageRoot,
    MEDIA_MAX_BYTES: 1024 * 1024,
    MEDIA_MAX_PIXELS: 10_000_000,
    MEDIA_UPLOAD_TTL_SECONDS: 900,
  };
  const config = {
    get: vi.fn((key: keyof typeof values) => values[key]),
  } as unknown as ConfigService<Environment, true>;
  return new MediaService(prisma, identities, new FixedClock(), config);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fileSystem.rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("media storage boundaries", () => {
  it("rejects traversal and platform-absolute storage keys", () => {
    const root = "/srv/our-tomorrow/media";

    expect(() => resolveStoragePath(root, "../secret.jpg")).toThrow(
      InvalidStorageKeyError,
    );
    expect(() => resolveStoragePath(root, "/etc/passwd")).toThrow(
      InvalidStorageKeyError,
    );
    expect(() => resolveStoragePath(root, "C:\\secrets\\photo.jpg")).toThrow(
      InvalidStorageKeyError,
    );
    expect(resolveStoragePath(root, "media/11/photo.webp")).toBe(
      "/srv/our-tomorrow/media/media/11/photo.webp",
    );
  });

  it("checks decoded type, animation, and pixel count", () => {
    expect(
      validateImageMetadata(
        { format: "jpeg", width: 2_000, height: 1_000 } as Metadata,
        "image/jpeg",
        2_000_000,
      ),
    ).toBe("image/jpeg");

    expect(() =>
      validateImageMetadata(
        { format: "png", width: 10, height: 10 } as Metadata,
        "image/jpeg",
        1_000,
      ),
    ).toThrow(InvalidImageError);
    expect(() =>
      validateImageMetadata(
        { format: "webp", width: 10, height: 10, pages: 2 } as Metadata,
        "image/webp",
        1_000,
      ),
    ).toThrow("Animated and multi-page images are not allowed");
    expect(() =>
      validateImageMetadata(
        { format: "jpeg", width: 2_001, height: 1_000 } as Metadata,
        "image/jpeg",
        2_000_000,
      ),
    ).toThrow("pixel count exceeds");
  });

  it("requires a bounded visible Idempotency-Key", () => {
    expect(parseIdempotencyKey("upload-11111111")).toBe("upload-11111111");
    expect(() => parseIdempotencyKey(undefined)).toThrow(
      "Idempotency-Key must contain 8 to 128 visible ASCII characters",
    );
    expect(() => parseIdempotencyKey("contains a space")).toThrow();
  });
});

describe("MediaService", () => {
  it("re-encodes a real image, rotates it, strips EXIF, and creates a thumbnail", async () => {
    const storageRoot = await temporaryMediaRoot();
    const source = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 219, g: 92, b: 120 },
      },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: MEDIA_ID,
        mimeType: "image/png",
        size: BigInt(source.byteLength),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: MEDIA_ID,
        originalName: "with-location.png",
        mimeType: "image/png",
        size: BigInt(source.byteLength),
        createdAt: new Date("2026-07-16T08:29:00.000Z"),
        uploadedAt: new Date("2026-07-16T08:30:00.000Z"),
      });
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      mediaAsset: { findFirst, updateMany },
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "record-1" }),
      },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity()),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);

    await service.receiveUpload(
      "boy",
      MEDIA_ID,
      Readable.from([source]),
      String(source.byteLength),
      "image/png",
    );
    expect(findFirst.mock.calls[0]![0].where).toMatchObject({
      id: MEDIA_ID,
      coupleId: COUPLE_ID,
      createdById: BOY_ID,
      status: MediaStatus.PENDING,
      uploadedAt: null,
      uploadExpiresAt: { gt: new Date("2026-07-16T08:30:00.000Z") },
    });
    const result = await service.complete(
      "boy",
      MEDIA_ID,
      "complete-upload-11111111",
    );
    expect(findFirst.mock.calls[2]![0].where).toMatchObject({
      id: MEDIA_ID,
      coupleId: COUPLE_ID,
      createdById: BOY_ID,
      status: MediaStatus.PENDING,
      uploadedAt: { not: null },
      uploadExpiresAt: { gt: new Date("2026-07-16T08:30:00.000Z") },
    });

    expect(result).toMatchObject({
      id: MEDIA_ID,
      originalName: "with-location.png",
      mimeType: "image/webp",
      width: 2,
      height: 3,
      url: `/api/v1/media/${MEDIA_ID}`,
      thumbnailUrl: `/api/v1/media/${MEDIA_ID}/thumbnail`,
    });
    const readyUpdate = updateMany.mock.calls[1]![0];
    expect(readyUpdate.where).toMatchObject({
      id: MEDIA_ID,
      coupleId: COUPLE_ID,
      createdById: BOY_ID,
      status: MediaStatus.PENDING,
    });
    expect(readyUpdate.data).toMatchObject({
      status: MediaStatus.READY,
      mimeType: "image/webp",
      width: 2,
      height: 3,
    });
    expect(readyUpdate.data.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const processedPath = resolveStoragePath(
      storageRoot,
      readyUpdate.data.storageKey,
    );
    const processedMetadata = await sharp(processedPath).metadata();
    expect(processedMetadata).toMatchObject({
      format: "webp",
      width: 2,
      height: 3,
    });
    expect(processedMetadata.exif).toBeUndefined();
    expect((await fileSystem.stat(processedPath)).mode & 0o777).toBe(0o600);
    await expect(
      fileSystem.stat(
        resolveStoragePath(storageRoot, readyUpdate.data.thumbnailKey),
      ),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("quarantines bytes that cannot be decoded as the declared image", async () => {
    const storageRoot = await temporaryMediaRoot();
    const source = Buffer.from("not-a-real-jpeg");
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: MEDIA_ID,
        mimeType: "image/jpeg",
        size: BigInt(source.byteLength),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: MEDIA_ID,
        originalName: "broken.jpg",
        mimeType: "image/jpeg",
        size: BigInt(source.byteLength),
        createdAt: new Date("2026-07-16T08:29:00.000Z"),
        uploadedAt: new Date("2026-07-16T08:30:00.000Z"),
      });
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      mediaAsset: { findFirst, updateMany },
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity()),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    await service.receiveUpload(
      "boy",
      MEDIA_ID,
      Readable.from([source]),
      String(source.byteLength),
      "image/jpeg",
    );
    await expect(
      service.complete("boy", MEDIA_ID, "complete-upload-11111111"),
    ).rejects.toMatchObject({ status: 415 });

    expect(updateMany.mock.calls[1]![0]).toMatchObject({
      where: {
        id: MEDIA_ID,
        coupleId: COUPLE_ID,
        createdById: BOY_ID,
        status: MediaStatus.PENDING,
      },
      data: { status: MediaStatus.QUARANTINED },
    });
    await expect(
      fileSystem.readdir(path.join(storageRoot, "quarantine", MEDIA_ID)),
    ).resolves.toHaveLength(1);
  });

  it("replays a completed upload for the same actor, route, key, and upload", async () => {
    const storageRoot = await temporaryMediaRoot();
    const summary = {
      id: MEDIA_ID,
      originalName: "remember.webp",
      mimeType: "image/webp",
      size: 1_234,
      width: 800,
      height: 600,
      url: `/api/v1/media/${MEDIA_ID}`,
      thumbnailUrl: `/api/v1/media/${MEDIA_ID}/thumbnail`,
      createdAt: "2026-07-16T08:29:00.000Z",
    };
    const key = "complete-upload-11111111";
    const findUnique = vi.fn().mockResolvedValue({
      requestHash: createHash("sha256")
        .update(JSON.stringify({ uploadId: MEDIA_ID }))
        .digest("hex"),
      responseBody: summary,
    });
    const mediaFindFirst = vi.fn();
    const prisma = {
      idempotencyRecord: { findUnique },
      mediaAsset: { findFirst: mediaFindFirst },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity()),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);

    await expect(service.complete("boy", MEDIA_ID, key)).resolves.toEqual(
      summary,
    );
    expect(mediaFindFirst).not.toHaveBeenCalled();
    expect(findUnique.mock.calls[0]![0].where).toEqual({
      userId_route_keyHash: {
        userId: BOY_ID,
        route: "POST /api/v1/uploads/complete",
        keyHash: createHash("sha256").update(key).digest("hex"),
      },
    });
  });

  it("rejects reuse of a completion key for another upload", async () => {
    const storageRoot = await temporaryMediaRoot();
    const otherUploadId = "22222222-2222-4222-8222-222222222222";
    const prisma = {
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue({
          requestHash: createHash("sha256")
            .update(JSON.stringify({ uploadId: otherUploadId }))
            .digest("hex"),
          responseBody: {},
        }),
      },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity()),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);

    await expect(
      service.complete("boy", MEDIA_ID, "complete-upload-11111111"),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("scopes private reads and only admits partner-visible associations", async () => {
    const storageRoot = await temporaryMediaRoot();
    const storageKey = `media/11/${MEDIA_ID}/original.webp`;
    const mediaPath = resolveStoragePath(storageRoot, storageKey);
    await fileSystem.mkdir(path.dirname(mediaPath), { recursive: true });
    await fileSystem.writeFile(mediaPath, Buffer.from("private-image"), {
      mode: 0o600,
    });

    const findFirst = vi.fn().mockResolvedValue({
      id: MEDIA_ID,
      originalName: "private.webp",
      mimeType: "image/webp",
      storageKey,
      thumbnailKey: null,
      checksumSha256: "a".repeat(64),
    });
    const prisma = {
      mediaAsset: { findFirst },
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity(GIRL_ID)),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);

    const opened = await service.open("girl", MEDIA_ID, false);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(chunk as Buffer);

    expect(Buffer.concat(chunks).toString()).toBe("private-image");
    const query = findFirst.mock.calls[0]![0];
    expect(query.where).toMatchObject({
      id: MEDIA_ID,
      coupleId: COUPLE_ID,
      status: MediaStatus.READY,
      deletedAt: null,
    });
    expect(query.where.OR).toContainEqual({ createdById: GIRL_ID });
    expect(query.where.OR).toContainEqual({
      memoryMedia: {
        some: {
          memory: {
            coupleId: COUPLE_ID,
            status: { in: ["PUBLISHED", "ARCHIVED"] },
            deletedAt: null,
          },
        },
      },
    });
  });

  it("does not soft-delete an image while shared content still references it", async () => {
    const storageRoot = await temporaryMediaRoot();
    const updateMany = vi.fn();
    const transaction = {
      mediaAsset: {
        findFirst: vi.fn().mockResolvedValue({
          id: MEDIA_ID,
          status: MediaStatus.READY,
          _count: {
            usedAsUserAvatar: 0,
            usedAsCoupleCover: 0,
            usedAsMemoryCover: 0,
            usedAsAnniversaryCover: 0,
            memoryMedia: 1,
            capsuleMedia: 0,
            reviewContributions: 0,
          },
        }),
        updateMany,
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaService;
    const identities = {
      current: vi.fn().mockResolvedValue(identity()),
    } as unknown as IdentityService;
    const service = mediaService(prisma, identities, storageRoot);

    await expect(service.remove("boy", MEDIA_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
