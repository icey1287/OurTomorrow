import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MediaKind,
  MediaStatus,
  Prisma,
  RecycleBinResourceType,
  RecycleBinVisibility,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { constants, promises as fileSystem } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import sharp, { type OutputInfo } from "sharp";
import { Clock } from "../common/clock/clock";
import {
  ApiException,
  resourceNotFound,
  stateConflict,
  validationFailed,
} from "../common/http/api-exception";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import { createRecycleBinItem } from "../recycle-bin/recycle-bin.persistence";
import type {
  MediaAssetSummaryDto,
  PresignUploadDto,
  UploadIntentDto,
} from "./dto/upload.dto";
import { UPLOAD_COMPLETE_ROUTE } from "./idempotency-key";
import { readableMediaAssetWhere } from "./media-access";
import {
  InvalidImageError,
  InvalidStorageKeyError,
  mediaStorageKey,
  normalizeMimeType,
  processedExtensionForMime,
  quarantineStorageKey,
  resolveStoragePath,
  stagingStorageKey,
  thumbnailStorageKey,
  validateImageMetadata,
} from "./media-storage";

const THUMBNAIL_MAX_EDGE = 640;
const IDEMPOTENCY_RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;

type PendingUpload = {
  id: string;
  originalName: string;
  mimeType: string;
  size: bigint;
  createdAt: Date;
};

export type PrivateMediaStream = {
  stream: Readable;
  options: {
    type: string;
    length: number;
    disposition: string;
  };
  etag: string;
  lastModified: string;
};

function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function mediaTooLarge(maxBytes: number): ApiException {
  return new ApiException(
    HttpStatus.PAYLOAD_TOO_LARGE,
    "MEDIA_TOO_LARGE",
    `Image uploads cannot exceed ${maxBytes} bytes`,
  );
}

function unsupportedImage(
  message = "The uploaded file is not a valid image",
): ApiException {
  return new ApiException(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    "UNSUPPORTED_IMAGE",
    message,
  );
}

function idempotencyConflict(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    "IDEMPOTENCY_CONFLICT",
    "This Idempotency-Key was already used for a different upload",
  );
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly storageRoot: string;
  private readonly maxBytes: number;
  private readonly maxPixels: number;
  private readonly uploadTtlSeconds: number;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.storageRoot = path.resolve(
      config.get("MEDIA_STORAGE_PATH", { infer: true }),
    );
    this.maxBytes = config.get("MEDIA_MAX_BYTES", { infer: true });
    this.maxPixels = config.get("MEDIA_MAX_PIXELS", { infer: true });
    this.uploadTtlSeconds = config.get("MEDIA_UPLOAD_TTL_SECONDS", {
      infer: true,
    });
  }

  async presign(
    role: IdentityRole,
    dto: PresignUploadDto,
  ): Promise<UploadIntentDto> {
    if (dto.size > this.maxBytes) throw mediaTooLarge(this.maxBytes);
    const identity = await this.identities.current(role);
    const uploadId = randomUUID();
    const extension = processedExtensionForMime(dto.mimeType);
    const expiresAt = new Date(
      this.clock.now().valueOf() + this.uploadTtlSeconds * 1_000,
    );

    await this.prisma.mediaAsset.create({
      data: {
        id: uploadId,
        coupleId: identity.couple.id,
        createdById: identity.user.id,
        storageKey: mediaStorageKey(uploadId, extension),
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        kind: MediaKind.IMAGE,
        status: MediaStatus.PENDING,
        size: BigInt(dto.size),
        uploadExpiresAt: expiresAt,
      },
      select: { id: true },
    });

    return {
      uploadId,
      uploadUrl: `/api/v1/uploads/${uploadId}/content`,
      method: "PUT",
      expiresAt: expiresAt.toISOString(),
    };
  }

  async receiveUpload(
    role: IdentityRole,
    uploadId: string,
    source: Readable,
    contentLength: string | undefined,
    contentType: string | undefined,
  ): Promise<void> {
    const identity = await this.identities.current(role);
    const declaredContentLength = this.parseContentLength(contentLength);
    if (
      declaredContentLength !== undefined &&
      declaredContentLength > this.maxBytes
    ) {
      throw mediaTooLarge(this.maxBytes);
    }

    const stagingDirectory = resolveStoragePath(
      this.storageRoot,
      stagingStorageKey(uploadId),
    );
    await this.withAssetLock(stagingDirectory, async () => {
      const now = this.clock.now();
      const upload = await this.prisma.mediaAsset.findFirst({
        where: {
          id: uploadId,
          coupleId: identity.couple.id,
          createdById: identity.user.id,
          kind: MediaKind.IMAGE,
          status: MediaStatus.PENDING,
          deletedAt: null,
          uploadedAt: null,
          uploadExpiresAt: { gt: now },
        },
        select: { id: true, mimeType: true, size: true },
      });
      if (!upload) throw resourceNotFound();

      const normalizedContentType =
        contentType === undefined ? undefined : normalizeMimeType(contentType);
      if (
        normalizedContentType !== undefined &&
        normalizedContentType !== "application/octet-stream" &&
        normalizedContentType !== normalizeMimeType(upload.mimeType)
      ) {
        throw unsupportedImage(
          "Upload Content-Type must match the declared image type",
        );
      }

      const expectedSize = Number(upload.size);
      if (
        declaredContentLength !== undefined &&
        declaredContentLength !== expectedSize
      ) {
        throw validationFailed(
          "Upload Content-Length must match the declared size",
        );
      }

      const sourcePath = path.join(stagingDirectory, "source.bin");
      const temporaryPath = path.join(
        stagingDirectory,
        `.incoming-${randomUUID()}.tmp`,
      );
      await fileSystem.rm(sourcePath, { force: true });

      let actualSize: number;
      try {
        actualSize = await this.writeLimitedStream(source, temporaryPath);
        if (actualSize !== expectedSize) {
          throw validationFailed(
            "Uploaded byte count must match the declared size",
          );
        }
        await fileSystem.rename(temporaryPath, sourcePath);
      } catch (error) {
        await fileSystem.rm(temporaryPath, { force: true });
        throw error;
      }

      const updated = await this.prisma.mediaAsset.updateMany({
        where: {
          id: upload.id,
          coupleId: identity.couple.id,
          createdById: identity.user.id,
          status: MediaStatus.PENDING,
          deletedAt: null,
          uploadedAt: null,
          uploadExpiresAt: { gt: now },
        },
        data: {
          size: BigInt(actualSize),
          uploadedAt: now,
        },
      });
      if (updated.count !== 1) {
        await fileSystem.rm(sourcePath, { force: true });
        throw stateConflict();
      }
    });
  }

  async complete(
    role: IdentityRole,
    uploadId: string,
    idempotencyKey: string,
  ): Promise<MediaAssetSummaryDto> {
    const identity = await this.identities.current(role);
    const keyHash = this.hashValue(idempotencyKey);
    const requestHash = this.hashValue(JSON.stringify({ uploadId }));
    const replay = await this.replayCompletion(
      identity.user.id,
      keyHash,
      requestHash,
      uploadId,
    );
    if (replay !== undefined) return replay;

    const alreadyReady = await this.readySummary(
      identity.couple.id,
      identity.user.id,
      uploadId,
    );
    if (alreadyReady !== undefined) {
      return this.rememberCompletion(
        identity.couple.id,
        identity.user.id,
        keyHash,
        requestHash,
        uploadId,
        alreadyReady,
      );
    }

    const stagingDirectory = resolveStoragePath(
      this.storageRoot,
      stagingStorageKey(uploadId),
    );

    return this.withAssetLock(stagingDirectory, async () => {
      const upload = await this.prisma.mediaAsset.findFirst({
        where: {
          id: uploadId,
          coupleId: identity.couple.id,
          createdById: identity.user.id,
          kind: MediaKind.IMAGE,
          status: MediaStatus.PENDING,
          deletedAt: null,
          uploadedAt: { not: null },
          uploadExpiresAt: { gt: this.clock.now() },
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
      });
      if (!upload) throw resourceNotFound();

      try {
        const summary = await this.processUpload(
          identity.couple.id,
          identity.user.id,
          upload,
        );
        return await this.rememberCompletion(
          identity.couple.id,
          identity.user.id,
          keyHash,
          requestHash,
          uploadId,
          summary,
        );
      } catch (error) {
        await this.quarantine(
          identity.couple.id,
          identity.user.id,
          upload.id,
          error,
        );
        if (error instanceof InvalidImageError) {
          throw unsupportedImage(error.message);
        }
        throw error;
      }
    });
  }

  async open(
    role: IdentityRole,
    mediaId: string,
    thumbnail: boolean,
  ): Promise<PrivateMediaStream> {
    const identity = await this.identities.current(role);
    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaId,
        ...readableMediaAssetWhere(identity.couple.id, identity.user.id),
      },
      select: {
        id: true,
        mimeType: true,
        storageKey: true,
        thumbnailKey: true,
        checksumSha256: true,
      },
    });
    if (!media) throw resourceNotFound();

    const storageKey = thumbnail ? media.thumbnailKey : media.storageKey;
    if (!storageKey) throw resourceNotFound();

    let mediaPath: string;
    try {
      mediaPath = resolveStoragePath(this.storageRoot, storageKey);
    } catch (error) {
      if (error instanceof InvalidStorageKeyError) throw resourceNotFound();
      throw error;
    }

    const handle = await this.openRegularFile(mediaPath);
    const stats = await handle.stat();
    const mimeType = thumbnail ? "image/webp" : media.mimeType;
    const extension = mimeType === "image/jpeg" ? "jpg" : "webp";
    const etag =
      !thumbnail && media.checksumSha256
        ? `\"sha256:${media.checksumSha256}\"`
        : `W/\"${media.id}:${thumbnail ? "thumbnail" : "source"}:${stats.size}:${stats.mtimeMs}\"`;

    return {
      stream: handle.createReadStream(),
      options: {
        type: mimeType,
        length: stats.size,
        disposition: `inline; filename=\"media-${media.id}.${extension}\"`,
      },
      etag,
      lastModified: stats.mtime.toUTCString(),
    };
  }

  async remove(role: IdentityRole, mediaId: string): Promise<void> {
    const identity = await this.identities.current(role);
    await this.serializable(async (transaction) => {
      const media = await transaction.mediaAsset.findFirst({
        where: {
          id: mediaId,
          coupleId: identity.couple.id,
          createdById: identity.user.id,
          status: { not: MediaStatus.DELETED },
          deletedAt: null,
        },
        select: {
          id: true,
          status: true,
          _count: {
            select: {
              usedAsUserAvatar: true,
              usedAsCoupleCover: true,
              usedAsMemoryCover: true,
              usedAsAnniversaryCover: true,
              memoryMedia: true,
              wishMedia: true,
              capsuleMedia: true,
              reviewContributions: true,
            },
          },
        },
      });
      if (!media) throw resourceNotFound();
      if (Object.values(media._count).some((count) => count > 0)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "MEDIA_IN_USE",
          "Detach this image from shared content before deleting it",
        );
      }

      const deletedAt = this.clock.now();
      const deleted = await transaction.mediaAsset.updateMany({
        where: {
          id: media.id,
          coupleId: identity.couple.id,
          createdById: identity.user.id,
          status: media.status,
          deletedAt: null,
        },
        data: {
          status: MediaStatus.DELETED,
          deletedAt,
        },
      });
      if (deleted.count !== 1) throw stateConflict();
      await createRecycleBinItem(transaction, {
        coupleId: identity.couple.id,
        resourceType: RecycleBinResourceType.MEDIA,
        resourceId: media.id,
        deletedById: identity.user.id,
        deletedAt,
        restoreData: { status: media.status },
        visibility: RecycleBinVisibility.OWNER_ONLY,
        ownerId: identity.user.id,
      });
    });
  }

  private async replayCompletion(
    userId: string,
    keyHash: string,
    requestHash: string,
    uploadId: string,
  ): Promise<MediaAssetSummaryDto | undefined> {
    const record = await this.prisma.idempotencyRecord.findUnique({
      where: {
        userId_route_keyHash: {
          userId,
          route: UPLOAD_COMPLETE_ROUTE,
          keyHash,
        },
      },
      select: { requestHash: true, responseBody: true, expiresAt: true },
    });
    if (!record) return undefined;
    if (record.expiresAt <= this.clock.now()) {
      await this.prisma.idempotencyRecord.deleteMany({
        where: {
          userId,
          route: UPLOAD_COMPLETE_ROUTE,
          keyHash,
          expiresAt: { lte: this.clock.now() },
        },
      });
      return undefined;
    }
    if (record.requestHash !== requestHash) throw idempotencyConflict();
    return this.parseStoredSummary(record.responseBody, uploadId);
  }

  private async readySummary(
    coupleId: string,
    userId: string,
    uploadId: string,
  ): Promise<MediaAssetSummaryDto | undefined> {
    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        id: uploadId,
        coupleId,
        createdById: userId,
        kind: MediaKind.IMAGE,
        status: MediaStatus.READY,
        deletedAt: null,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        createdAt: true,
      },
    });
    if (!media) return undefined;
    return {
      id: media.id,
      originalName: media.originalName,
      mimeType: media.mimeType,
      size: Number(media.size),
      width: media.width,
      height: media.height,
      url: `/api/v1/media/${media.id}`,
      thumbnailUrl: `/api/v1/media/${media.id}/thumbnail`,
      createdAt: media.createdAt.toISOString(),
    };
  }

  private async rememberCompletion(
    coupleId: string,
    userId: string,
    keyHash: string,
    requestHash: string,
    uploadId: string,
    summary: MediaAssetSummaryDto,
  ): Promise<MediaAssetSummaryDto> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          coupleId,
          route: UPLOAD_COMPLETE_ROUTE,
          keyHash,
          requestHash,
          responseStatus: HttpStatus.OK,
          responseBody: summary as unknown as Prisma.InputJsonObject,
          expiresAt: new Date(
            this.clock.now().valueOf() + IDEMPOTENCY_RETENTION_MILLISECONDS,
          ),
        },
        select: { id: true },
      });
      return summary;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replay = await this.replayCompletion(
          userId,
          keyHash,
          requestHash,
          uploadId,
        );
        if (replay !== undefined) return replay;
        throw stateConflict();
      }
      throw error;
    }
  }

  private parseStoredSummary(
    value: Prisma.JsonValue,
    uploadId: string,
  ): MediaAssetSummaryDto {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw stateConflict();
    }
    const summary = value as Record<string, Prisma.JsonValue>;
    const width = summary.width;
    const height = summary.height;
    if (
      summary.id !== uploadId ||
      typeof summary.originalName !== "string" ||
      typeof summary.mimeType !== "string" ||
      typeof summary.size !== "number" ||
      (typeof width !== "number" && width !== null) ||
      (typeof height !== "number" && height !== null) ||
      typeof summary.url !== "string" ||
      typeof summary.thumbnailUrl !== "string" ||
      typeof summary.createdAt !== "string"
    ) {
      throw stateConflict();
    }
    return {
      id: uploadId,
      originalName: summary.originalName,
      mimeType: summary.mimeType,
      size: summary.size,
      width,
      height,
      url: summary.url,
      thumbnailUrl: summary.thumbnailUrl,
      createdAt: summary.createdAt,
    };
  }

  private async processUpload(
    coupleId: string,
    userId: string,
    upload: PendingUpload,
  ): Promise<MediaAssetSummaryDto> {
    const sourcePath = resolveStoragePath(
      this.storageRoot,
      `${stagingStorageKey(upload.id)}/source.bin`,
    );
    const source = await this.readRegularFile(sourcePath);
    if (source.byteLength < 1) {
      throw new InvalidImageError("The uploaded image is empty");
    }
    if (source.byteLength > this.maxBytes) throw mediaTooLarge(this.maxBytes);
    if (source.byteLength !== Number(upload.size)) {
      throw new InvalidImageError("The staged image size is inconsistent");
    }

    const sharpOptions = {
      failOn: "error" as const,
      limitInputPixels: this.maxPixels,
    };
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(source, sharpOptions).metadata();
    } catch (error) {
      if (isFileSystemError(error)) throw error;
      throw new InvalidImageError("The uploaded image could not be decoded");
    }
    const inputMimeType = validateImageMetadata(
      metadata,
      upload.mimeType,
      this.maxPixels,
    );
    const outputExtension =
      inputMimeType === "image/jpeg" && !metadata.hasAlpha ? "jpg" : "webp";
    const outputMimeType =
      outputExtension === "jpg"
        ? ("image/jpeg" as const)
        : ("image/webp" as const);
    const storageKey = mediaStorageKey(upload.id, outputExtension);
    const thumbnailKey = thumbnailStorageKey(upload.id);
    const outputPath = resolveStoragePath(this.storageRoot, storageKey);
    const thumbnailPath = resolveStoragePath(this.storageRoot, thumbnailKey);
    const outputDirectory = path.dirname(outputPath);
    const temporaryOutputPath = path.join(
      outputDirectory,
      `.original-${randomUUID()}.tmp`,
    );
    const temporaryThumbnailPath = path.join(
      outputDirectory,
      `.thumbnail-${randomUUID()}.tmp`,
    );
    await fileSystem.mkdir(outputDirectory, { recursive: true, mode: 0o700 });

    let output: OutputInfo;
    try {
      const fullImage = sharp(source, sharpOptions)
        .rotate()
        .toColorspace("srgb");
      output =
        outputExtension === "jpg"
          ? await fullImage
              .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
              .toFile(temporaryOutputPath)
          : await fullImage
              .webp({ quality: 88, effort: 4 })
              .toFile(temporaryOutputPath);

      await sharp(source, sharpOptions)
        .rotate()
        .resize({
          width: THUMBNAIL_MAX_EDGE,
          height: THUMBNAIL_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toColorspace("srgb")
        .webp({ quality: 78, effort: 4 })
        .toFile(temporaryThumbnailPath);
      await Promise.all([
        fileSystem.chmod(temporaryOutputPath, 0o600),
        fileSystem.chmod(temporaryThumbnailPath, 0o600),
      ]);
      await Promise.all([
        this.syncFile(temporaryOutputPath),
        this.syncFile(temporaryThumbnailPath),
      ]);
      await fileSystem.rename(temporaryOutputPath, outputPath);
      await fileSystem.rename(temporaryThumbnailPath, thumbnailPath);
    } catch (error) {
      await Promise.all([
        fileSystem.rm(temporaryOutputPath, { force: true }),
        fileSystem.rm(temporaryThumbnailPath, { force: true }),
        fileSystem.rm(outputPath, { force: true }),
        fileSystem.rm(thumbnailPath, { force: true }),
      ]);
      if (isFileSystemError(error)) throw error;
      throw new InvalidImageError("The uploaded image could not be decoded");
    }

    let checksumSha256: string;
    try {
      checksumSha256 = await this.sha256(outputPath);
    } catch (error) {
      await Promise.all([
        fileSystem.rm(outputPath, { force: true }),
        fileSystem.rm(thumbnailPath, { force: true }),
      ]);
      throw error;
    }

    const now = this.clock.now();
    const ready = await this.prisma.mediaAsset.updateMany({
      where: {
        id: upload.id,
        coupleId,
        createdById: userId,
        status: MediaStatus.PENDING,
        deletedAt: null,
        uploadedAt: { not: null },
      },
      data: {
        storageKey,
        thumbnailKey,
        mimeType: outputMimeType,
        size: BigInt(output.size),
        width: output.width,
        height: output.height,
        checksumSha256,
        status: MediaStatus.READY,
        readyAt: now,
      },
    });
    if (ready.count !== 1) {
      await Promise.all([
        fileSystem.rm(outputPath, { force: true }),
        fileSystem.rm(thumbnailPath, { force: true }),
      ]);
      throw stateConflict();
    }

    try {
      await fileSystem.rm(
        resolveStoragePath(this.storageRoot, stagingStorageKey(upload.id)),
        { recursive: true, force: true },
      );
    } catch (error) {
      this.logger.warn(
        `Ready media ${upload.id} retained its staging directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return {
      id: upload.id,
      originalName: upload.originalName,
      mimeType: outputMimeType,
      size: output.size,
      width: output.width,
      height: output.height,
      url: `/api/v1/media/${upload.id}`,
      thumbnailUrl: `/api/v1/media/${upload.id}/thumbnail`,
      createdAt: upload.createdAt.toISOString(),
    };
  }

  private async quarantine(
    coupleId: string,
    userId: string,
    uploadId: string,
    error: unknown,
  ): Promise<void> {
    const sourcePath = resolveStoragePath(
      this.storageRoot,
      `${stagingStorageKey(uploadId)}/source.bin`,
    );
    const quarantinePath = resolveStoragePath(
      this.storageRoot,
      quarantineStorageKey(uploadId, this.clock.now()),
    );
    try {
      await fileSystem.mkdir(path.dirname(quarantinePath), {
        recursive: true,
        mode: 0o700,
      });
      await fileSystem.rename(sourcePath, quarantinePath);
    } catch (moveError) {
      if (!isFileSystemError(moveError) || moveError.code !== "ENOENT") {
        this.logger.error(
          `Failed to quarantine media ${uploadId}`,
          moveError instanceof Error ? moveError.stack : String(moveError),
        );
      }
    }

    await this.prisma.mediaAsset.updateMany({
      where: {
        id: uploadId,
        coupleId,
        createdById: userId,
        status: MediaStatus.PENDING,
        deletedAt: null,
      },
      data: { status: MediaStatus.QUARANTINED },
    });
    this.logger.warn(
      `Quarantined media ${uploadId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private parseContentLength(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (!/^\d+$/.test(value)) {
      throw validationFailed("Content-Length must be a positive integer");
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw validationFailed("Content-Length must be a positive integer");
    }
    return parsed;
  }

  private async writeLimitedStream(
    source: Readable,
    destination: string,
  ): Promise<number> {
    const handle = await fileSystem.open(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    let total = 0;
    try {
      for await (const chunk of source) {
        const buffer =
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : Buffer.from(chunk as Uint8Array);
        total += buffer.byteLength;
        if (total > this.maxBytes) throw mediaTooLarge(this.maxBytes);
        await handle.writeFile(buffer);
      }
      if (total < 1) throw validationFailed("The uploaded image is empty");
      await handle.sync();
      return total;
    } finally {
      await handle.close();
    }
  }

  private async withAssetLock<T>(
    stagingDirectory: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    await fileSystem.mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
    const lockPath = path.join(stagingDirectory, "asset.lock");
    const lock = await this.acquireAssetLock(lockPath);

    try {
      return await operation();
    } finally {
      await lock.close();
      await fileSystem.rm(lockPath, { force: true });
    }
  }

  private async acquireAssetLock(lockPath: string): Promise<FileHandle> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await fileSystem.open(
          lockPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
      } catch (error) {
        if (!isFileSystemError(error) || error.code !== "EEXIST") throw error;
        if (attempt === 2 || !(await this.isStaleLock(lockPath))) {
          throw stateConflict();
        }
        await fileSystem.rm(lockPath, { force: true });
      }
    }
    throw stateConflict();
  }

  private async isStaleLock(lockPath: string): Promise<boolean> {
    try {
      const stats = await fileSystem.lstat(lockPath);
      if (!stats.isFile()) return false;
      const staleAfterMilliseconds = Math.max(
        this.uploadTtlSeconds * 2_000,
        60 * 60 * 1_000,
      );
      return (
        this.clock.now().valueOf() - stats.mtime.valueOf() >
        staleAfterMilliseconds
      );
    } catch (error) {
      if (isFileSystemError(error) && error.code === "ENOENT") return true;
      throw error;
    }
  }

  private async readRegularFile(filePath: string): Promise<Buffer> {
    const handle = await this.openRegularFile(filePath);
    try {
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }

  private async openRegularFile(filePath: string): Promise<FileHandle> {
    let handle: FileHandle;
    try {
      handle = await fileSystem.open(
        filePath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if (
        isFileSystemError(error) &&
        ["ENOENT", "ELOOP"].includes(error.code ?? "")
      ) {
        throw resourceNotFound();
      }
      throw error;
    }

    let isFile = false;
    try {
      isFile = (await handle.stat()).isFile();
    } catch (error) {
      await handle.close();
      throw error;
    }
    if (!isFile) {
      await handle.close();
      throw resourceNotFound();
    }
    return handle;
  }

  private async syncFile(filePath: string): Promise<void> {
    const handle = await fileSystem.open(filePath, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async sha256(filePath: string): Promise<string> {
    const handle = await this.openRegularFile(filePath);
    const hash = createHash("sha256");
    try {
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        hash.update(chunk as Buffer);
      }
      return hash.digest("hex");
    } finally {
      await handle.close();
    }
  }

  private hashValue(value: string): string {
    return createHash("sha256").update(value).digest("hex");
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
