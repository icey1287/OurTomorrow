import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  promises as fileSystem,
} from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ExportFormat,
  ExportJobStatus,
  MemoryStatus,
  Prisma,
} from "@prisma/client";
import { ZipArchive } from "archiver";
import { AnniversariesService } from "../anniversaries/anniversaries.service";
import { CapsulesService } from "../capsules/capsules.service";
import { Clock } from "../common/clock/clock";
import { ApiException, resourceNotFound } from "../common/http/api-exception";
import { IdempotencyService } from "../common/idempotency/idempotency.service";
import type { Environment } from "../config/env.schema";
import { DailyEntriesService } from "../daily-entries/daily-entries.service";
import { PrismaService } from "../database/prisma.service";
import {
  FIXED_IDENTITIES,
  type IdentityRole,
} from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import { readableMediaAssetWhere } from "../media/media-access";
import { resolveStoragePath } from "../media/media-storage";
import { MemoriesService } from "../memories/memories.service";
import { NotesService } from "../notes/notes.service";
import { PlansService } from "../plans/plans.service";
import { StatusesService } from "../statuses/statuses.service";
import { WishesService } from "../wishes/wishes.service";
import type { CreateExportDto } from "./dto/export.dto";
import {
  exportJobSelect,
  toExportJobView,
  type ExportJobRecord,
  type ExportJobView,
} from "./export.presentation";

const EXPORT_FORMAT_VERSION = 1;
const EXPORT_RETENTION_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const STALE_RUNNING_MILLISECONDS = 30 * 60 * 1_000;
const RECOVERY_BATCH_SIZE = 3;

type ExportMediaRecord = Prisma.MediaAssetGetPayload<{
  select: {
    id: true;
    originalName: true;
    mimeType: true;
    size: true;
    checksumSha256: true;
    storageKey: true;
  };
}>;

export type ExportDownload = {
  stream: Readable;
  contentType: string;
  contentLength: number;
  filename: string;
};

function json(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, entry) =>
      typeof entry === "bigint"
        ? entry.toString()
        : entry instanceof Date
          ? entry.toISOString()
          : entry,
    2,
  );
}

function safeArchiveName(mediaId: string, originalName: string): string {
  const normalized = path
    .basename(originalName)
    .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
    .trim()
    .slice(0, 180);
  return `media/${mediaId}/${normalized || "image"}`;
}

function localDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roleForUserId(userId: string): IdentityRole | null {
  if (userId === FIXED_IDENTITIES.boy.userId) return "boy";
  if (userId === FIXED_IDENTITIES.girl.userId) return "girl";
  return null;
}

@Injectable()
export class ExportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExportsService.name);
  private readonly storageRoot: string;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
    @Inject(Clock)
    private readonly clock: Clock,
    @Inject(MemoriesService)
    private readonly memories: MemoriesService,
    @Inject(NotesService)
    private readonly notes: NotesService,
    @Inject(DailyEntriesService)
    private readonly dailyEntries: DailyEntriesService,
    @Inject(StatusesService)
    private readonly statuses: StatusesService,
    @Inject(WishesService)
    private readonly wishes: WishesService,
    @Inject(PlansService)
    private readonly plans: PlansService,
    @Inject(AnniversariesService)
    private readonly anniversaries: AnniversariesService,
    @Inject(CapsulesService)
    private readonly capsules: CapsulesService,
    @Inject(ConfigService)
    config: ConfigService<Environment, true>,
  ) {
    this.storageRoot = path.resolve(
      config.get("MEDIA_STORAGE_PATH", { infer: true }),
    );
  }

  onApplicationBootstrap(): void {
    // Export recovery is ancillary work. Running it in the background keeps
    // health and OpenAPI endpoints available while the database is warming up.
    void this.recoverPendingJobs();
  }

  private async recoverPendingJobs(): Promise<void> {
    try {
      await this.expireDueJobs();
      const staleBefore = new Date(
        this.clock.now().valueOf() - STALE_RUNNING_MILLISECONDS,
      );
      const recoverable = await this.prisma.exportJob.findMany({
        where: {
          OR: [
            { status: ExportJobStatus.PENDING },
            {
              status: ExportJobStatus.RUNNING,
              startedAt: { lte: staleBefore },
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RECOVERY_BATCH_SIZE,
        select: { id: true, requestedById: true },
      });
      for (const job of recoverable) {
        const role = roleForUserId(job.requestedById);
        if (!role) continue;
        try {
          await this.build(role, job.id);
        } catch {
          this.logger.error(`Export recovery failed for job ${job.id}`);
        }
      }
    } catch {
      this.logger.error("Export recovery scan failed");
    }
  }

  async list(role: IdentityRole): Promise<ExportJobView[]> {
    const actor = await this.identities.current(role);
    await this.expireDueJobs(actor.couple.id, actor.user.id);
    const jobs = await this.prisma.exportJob.findMany({
      where: {
        coupleId: actor.couple.id,
        requestedById: actor.user.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: exportJobSelect,
    });
    return Promise.all(jobs.map((job) => this.present(job)));
  }

  async get(role: IdentityRole, exportId: string): Promise<ExportJobView> {
    const actor = await this.identities.current(role);
    await this.expireDueJobs(actor.couple.id, actor.user.id);
    const job = await this.findJob(actor.couple.id, actor.user.id, exportId);
    return this.present(job);
  }

  async create(
    role: IdentityRole,
    dto: CreateExportDto,
    idempotencyKey: string,
  ): Promise<ExportJobView> {
    const actor = await this.identities.current(role);
    const result = await this.idempotency.execute({
      userId: actor.user.id,
      coupleId: actor.couple.id,
      route: "POST /exports",
      key: idempotencyKey,
      request: dto,
      operation: async (transaction) => {
        const job = await transaction.exportJob.create({
          data: {
            coupleId: actor.couple.id,
            requestedById: actor.user.id,
            format: dto.format as ExportFormat,
          },
          select: { id: true },
        });
        return {
          status: HttpStatus.CREATED,
          body: { exportId: job.id },
        };
      },
    });
    const exportId =
      typeof result.body === "object" &&
      result.body !== null &&
      "exportId" in result.body &&
      typeof result.body.exportId === "string"
        ? result.body.exportId
        : null;
    if (!exportId) throw new Error("Stored export response is invalid");
    await this.build(role, exportId);
    return this.get(role, exportId);
  }

  async download(
    role: IdentityRole,
    exportId: string,
  ): Promise<ExportDownload> {
    const actor = await this.identities.current(role);
    await this.expireDueJobs(actor.couple.id, actor.user.id);
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: exportId,
        coupleId: actor.couple.id,
        requestedById: actor.user.id,
      },
      select: {
        status: true,
        format: true,
        storageKey: true,
        expiresAt: true,
      },
    });
    if (!job) throw resourceNotFound();
    if (
      job.status !== ExportJobStatus.COMPLETED ||
      job.storageKey === null ||
      (job.expiresAt !== null && job.expiresAt <= this.clock.now())
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "EXPORT_NOT_READY",
        "The export is not ready for download",
      );
    }
    const filePath = resolveStoragePath(this.storageRoot, job.storageKey);
    const file = await fileSystem.stat(filePath).catch(() => null);
    if (!file?.isFile()) throw resourceNotFound();
    const extension = job.format === ExportFormat.ZIP ? "zip" : "json";
    return {
      stream: createReadStream(filePath),
      contentType:
        job.format === ExportFormat.ZIP
          ? "application/zip"
          : "application/json; charset=utf-8",
      contentLength: file.size,
      filename: `our-tomorrow-${localDate(this.clock.now())}-${exportId}.${extension}`,
    };
  }

  async remove(role: IdentityRole, exportId: string): Promise<void> {
    const actor = await this.identities.current(role);
    const job = await this.prisma.exportJob.findFirst({
      where: {
        id: exportId,
        coupleId: actor.couple.id,
        requestedById: actor.user.id,
      },
      select: { storageKey: true },
    });
    if (!job) throw resourceNotFound();
    await this.prisma.exportJob.updateMany({
      where: {
        id: exportId,
        coupleId: actor.couple.id,
        requestedById: actor.user.id,
      },
      data: {
        status: ExportJobStatus.EXPIRED,
        storageKey: null,
        checksum: null,
        expiresAt: this.clock.now(),
      },
    });
    await this.removeStoredFile(job.storageKey);
  }

  private async build(role: IdentityRole, exportId: string): Promise<void> {
    const actor = await this.identities.current(role);
    const now = this.clock.now();
    const staleBefore = new Date(now.valueOf() - STALE_RUNNING_MILLISECONDS);
    const claimed = await this.prisma.exportJob.updateMany({
      where: {
        id: exportId,
        coupleId: actor.couple.id,
        requestedById: actor.user.id,
        OR: [
          { status: { in: [ExportJobStatus.PENDING, ExportJobStatus.FAILED] } },
          {
            status: ExportJobStatus.RUNNING,
            startedAt: { lte: staleBefore },
          },
        ],
      },
      data: {
        status: ExportJobStatus.RUNNING,
        startedAt: now,
        completedAt: null,
        expiresAt: null,
        storageKey: null,
        checksum: null,
        lastError: null,
      },
    });
    if (claimed.count !== 1) {
      const existing = await this.findJob(
        actor.couple.id,
        actor.user.id,
        exportId,
      );
      if (existing.status === ExportJobStatus.COMPLETED) return;
      if (existing.status === ExportJobStatus.RUNNING) {
        await this.waitForBuild(actor.couple.id, actor.user.id, exportId);
        return;
      }
      throw new ApiException(
        HttpStatus.CONFLICT,
        "EXPORT_IN_PROGRESS",
        "The export is already being generated",
      );
    }

    try {
      const job = await this.prisma.exportJob.findFirst({
        where: {
          id: exportId,
          coupleId: actor.couple.id,
          requestedById: actor.user.id,
        },
        select: { format: true },
      });
      if (!job) throw resourceNotFound();
      const payload = await this.collect(role);
      const media = await this.collectMedia(actor.couple.id, actor.user.id);
      const result = await this.writeExport(
        exportId,
        job.format,
        payload,
        media,
      );
      const completedAt = this.clock.now();
      const completed = await this.prisma.exportJob.updateMany({
        where: {
          id: exportId,
          coupleId: actor.couple.id,
          requestedById: actor.user.id,
          status: ExportJobStatus.RUNNING,
        },
        data: {
          status: ExportJobStatus.COMPLETED,
          storageKey: result.storageKey,
          checksum: result.checksum,
          completedAt,
          expiresAt: new Date(
            completedAt.valueOf() + EXPORT_RETENTION_MILLISECONDS,
          ),
        },
      });
      if (completed.count !== 1) {
        await this.removeStoredFile(result.storageKey);
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EXPORT_STATE_CHANGED",
          "The export state changed while the package was being generated",
        );
      }
    } catch (error) {
      await this.prisma.exportJob.updateMany({
        where: {
          id: exportId,
          coupleId: actor.couple.id,
          requestedById: actor.user.id,
          status: ExportJobStatus.RUNNING,
        },
        data: {
          status: ExportJobStatus.FAILED,
          lastError: "Export generation failed",
        },
      });
      if (error instanceof ApiException) throw error;
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "EXPORT_FAILED",
        "The export could not be generated",
      );
    }
  }

  private async collect(role: IdentityRole): Promise<Record<string, unknown>> {
    const actor = await this.identities.current(role);
    const memoryIds = await this.prisma.memory.findMany({
      where: {
        coupleId: actor.couple.id,
        deletedAt: null,
        OR: [
          { status: { in: [MemoryStatus.PUBLISHED, MemoryStatus.ARCHIVED] } },
          { status: MemoryStatus.DRAFT, createdById: actor.user.id },
        ],
      },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const memories = [];
    for (const memory of memoryIds) {
      memories.push(await this.memories.get(role, memory.id));
    }

    const wishDetails = [];
    let wishCursor: string | undefined;
    do {
      const page = await this.wishes.list(role, {
        limit: 50,
        ...(wishCursor ? { cursor: wishCursor } : {}),
      });
      for (const wish of page.items) {
        wishDetails.push(await this.wishes.get(role, wish.id));
      }
      wishCursor = page.meta.nextCursor ?? undefined;
    } while (wishCursor);

    const anniversaryDetails = [];
    for (const anniversary of await this.anniversaries.list(role)) {
      anniversaryDetails.push(
        await this.anniversaries.get(role, anniversary.id),
      );
    }

    const capsuleDetails = [];
    for (const capsule of await this.capsules.list(role)) {
      capsuleDetails.push(await this.capsules.get(role, capsule.id));
    }

    const promptDates = await this.prisma.dailyPrompt.findMany({
      where: { coupleId: actor.couple.id },
      orderBy: [{ promptDate: "asc" }, { id: "asc" }],
      select: { promptDate: true },
      distinct: ["promptDate"],
    });
    const dailyEntries = [];
    for (const prompt of promptDates) {
      dailyEntries.push(
        await this.dailyEntries.byDate(role, localDate(prompt.promptDate)),
      );
    }

    const moods = await this.prisma.moodEntry.findMany({
      where: {
        coupleId: actor.couple.id,
        OR: [
          { authorId: actor.user.id },
          { authorId: { not: actor.user.id }, visibleToPartner: true },
        ],
      },
      orderBy: [{ entryDate: "asc" }, { authorId: "asc" }],
      select: {
        id: true,
        authorId: true,
        entryDate: true,
        mood: true,
        note: true,
        visibleToPartner: true,
        wantsResponse: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const [places, tags, notifications] = await Promise.all([
      this.prisma.place.findMany({
        where: { coupleId: actor.couple.id, deletedAt: null },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
          status: true,
          firstVisitedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.tag.findMany({
        where: { coupleId: actor.couple.id, deletedAt: null },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, color: true, createdAt: true },
      }),
      this.prisma.notification.findMany({
        where: {
          coupleId: actor.couple.id,
          recipientId: actor.user.id,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          payload: true,
          status: true,
          createdAt: true,
          readAt: true,
          archivedAt: true,
        },
      }),
    ]);

    return {
      format: "our-tomorrow-data",
      version: EXPORT_FORMAT_VERSION,
      exportedAt: this.clock.now().toISOString(),
      identity: { role, user: actor.user },
      couple: actor.couple,
      memories,
      notes: await this.notes.list(role, {
        scope: "all",
        includeArchived: true,
      }),
      dailyEntries,
      moods,
      statuses: await this.statuses.current(role),
      wishes: wishDetails,
      plans: await this.plans.list(role, {}),
      anniversaries: anniversaryDetails,
      capsules: capsuleDetails,
      places,
      tags,
      notifications,
    };
  }

  private collectMedia(
    coupleId: string,
    userId: string,
  ): Promise<ExportMediaRecord[]> {
    return this.prisma.mediaAsset.findMany({
      where: readableMediaAssetWhere(coupleId, userId),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        checksumSha256: true,
        storageKey: true,
      },
    });
  }

  private async writeExport(
    exportId: string,
    format: ExportFormat,
    data: Record<string, unknown>,
    media: ExportMediaRecord[],
  ): Promise<{
    storageKey: string;
    checksum: string;
  }> {
    const extension = format === ExportFormat.ZIP ? "zip" : "json";
    const storageKey = `exports/${exportId}.${extension}`;
    const finalPath = resolveStoragePath(this.storageRoot, storageKey);
    const temporaryPath = `${finalPath}.${randomUUID()}.part`;
    await fileSystem.mkdir(path.dirname(finalPath), {
      recursive: true,
      mode: 0o700,
    });

    let promoted = false;
    try {
      if (format === ExportFormat.JSON) {
        const mediaManifest = await this.mediaManifest(media);
        await fileSystem.writeFile(
          temporaryPath,
          json({ ...data, media: mediaManifest }),
          { encoding: "utf8", flag: "wx", mode: 0o600 },
        );
      } else {
        const mediaManifest = await this.mediaManifest(media);
        const archive = new ZipArchive({ zlib: { level: 9 } });
        const completion = pipeline(
          archive,
          createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
        );
        const manifest = {
          format: "our-tomorrow-export",
          version: EXPORT_FORMAT_VERSION,
          generatedAt: this.clock.now().toISOString(),
          dataFile: "data.json",
          media: mediaManifest,
        };
        archive.append(json(manifest), { name: "manifest.json" });
        archive.append(json(data), { name: "data.json" });
        archive.append(
          "OurTomorrow private export. Keep this archive somewhere private.\n",
          { name: "README.txt" },
        );
        for (const item of mediaManifest) {
          const mediaRecord = media.find(
            (candidate) => candidate.id === item.id,
          );
          if (!mediaRecord) {
            throw new Error("Export media manifest is invalid");
          }
          archive.file(
            resolveStoragePath(this.storageRoot, mediaRecord.storageKey),
            { name: item.file },
          );
        }
        await archive.finalize();
        await completion;
      }

      await fileSystem.rm(finalPath, { force: true });
      await fileSystem.rename(temporaryPath, finalPath);
      promoted = true;
      const checksum = await this.fileChecksum(finalPath);
      return { storageKey, checksum };
    } catch (error) {
      await fileSystem.rm(temporaryPath, { force: true });
      if (promoted) await fileSystem.rm(finalPath, { force: true });
      throw error;
    }
  }

  private async mediaManifest(media: ExportMediaRecord[]): Promise<
    Array<{
      id: string;
      file: string;
      originalName: string;
      mimeType: string;
      size: string;
      checksumSha256: string | null;
    }>
  > {
    const manifest = [];
    for (const asset of media) {
      const source = resolveStoragePath(this.storageRoot, asset.storageKey);
      const file = await fileSystem.stat(source).catch(() => null);
      if (!file?.isFile()) {
        throw new Error(`Readable media ${asset.id} is missing`);
      }
      manifest.push({
        id: asset.id,
        file: safeArchiveName(asset.id, asset.originalName),
        originalName: asset.originalName,
        mimeType: asset.mimeType,
        size: asset.size.toString(),
        checksumSha256: asset.checksumSha256,
      });
    }
    return manifest;
  }

  private async fileChecksum(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return hash.digest("hex");
  }

  private async present(job: ExportJobRecord): Promise<ExportJobView> {
    let fileSize: number | null = null;
    if (job.status === ExportJobStatus.COMPLETED) {
      const storage = await this.prisma.exportJob.findUnique({
        where: { id: job.id },
        select: { storageKey: true },
      });
      if (storage?.storageKey) {
        const filePath = resolveStoragePath(
          this.storageRoot,
          storage.storageKey,
        );
        const file = await fileSystem.stat(filePath).catch(() => null);
        fileSize = file?.isFile() ? file.size : null;
      }
    }
    return toExportJobView(job, fileSize, this.clock.now());
  }

  private async waitForBuild(
    coupleId: string,
    userId: string,
    exportId: string,
  ): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const job = await this.findJob(coupleId, userId, exportId);
      if (job.status === ExportJobStatus.COMPLETED) return;
      if (job.status === ExportJobStatus.FAILED) {
        throw new ApiException(
          HttpStatus.INTERNAL_SERVER_ERROR,
          "EXPORT_FAILED",
          "The export could not be generated",
        );
      }
      if (job.status === ExportJobStatus.EXPIRED) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EXPORT_EXPIRED",
          "The export expired before it could be downloaded",
        );
      }
    }
    throw new ApiException(
      HttpStatus.CONFLICT,
      "EXPORT_IN_PROGRESS",
      "The export is still being generated",
    );
  }

  private async findJob(
    coupleId: string,
    userId: string,
    exportId: string,
  ): Promise<ExportJobRecord> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportId, coupleId, requestedById: userId },
      select: exportJobSelect,
    });
    if (!job) throw resourceNotFound();
    return job;
  }

  private async expireDueJobs(
    coupleId?: string,
    userId?: string,
  ): Promise<void> {
    const now = this.clock.now();
    const due = await this.prisma.exportJob.findMany({
      where: {
        ...(coupleId ? { coupleId } : {}),
        ...(userId ? { requestedById: userId } : {}),
        status: ExportJobStatus.COMPLETED,
        expiresAt: { lte: now },
      },
      select: { id: true, storageKey: true },
    });
    if (!due.length) return;
    await this.prisma.exportJob.updateMany({
      where: { id: { in: due.map((job) => job.id) } },
      data: {
        status: ExportJobStatus.EXPIRED,
        storageKey: null,
        checksum: null,
      },
    });
    await Promise.all(due.map((job) => this.removeStoredFile(job.storageKey)));
  }

  private async removeStoredFile(storageKey: string | null): Promise<void> {
    if (!storageKey) return;
    await fileSystem.rm(resolveStoragePath(this.storageRoot, storageKey), {
      force: true,
    });
  }
}
