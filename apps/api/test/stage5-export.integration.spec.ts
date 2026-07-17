import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { Stage1HttpClient, type FixedRole } from "./helpers/http-client";
import {
  createTestPrisma,
  integrationDatabaseUrl,
  resetTestDatabase,
} from "./helpers/test-database";
import {
  startTestApplication,
  type RunningTestApplication,
} from "./helpers/test-app";

type IdentitySession = {
  user: { id: string; role: FixedRole };
  couple: { id: string };
};

type VersionedResource = {
  id: string;
  version: number;
};

type UploadIntent = {
  uploadId: string;
  uploadUrl: string;
};

type MediaSummary = {
  id: string;
  originalName: string;
};

type ExportJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";
  format: "ZIP" | "JSON";
  checksumSha256: string | null;
  fileSize: number | null;
  downloadAvailable: boolean;
};

type ApiError = { code: string };

type ExportData = {
  format: string;
  version: number;
  identity: { role: FixedRole };
  memories: Array<{ title: string }>;
  capsules: Array<{
    title: string;
    bodyAvailable: boolean;
    messages?: Array<{ content: string }>;
    media?: Array<{ id: string; originalName: string }>;
  }>;
  media?: Array<{
    id: string;
    file: string;
    originalName: string;
  }>;
};

type ExportManifest = {
  format: string;
  version: number;
  dataFile: string;
  media: Array<{
    id: string;
    file: string;
    originalName: string;
    size: string;
  }>;
};

async function selectIdentity(
  client: Stage1HttpClient,
  role: FixedRole,
): Promise<IdentitySession> {
  const response = await client.post<IdentitySession>(
    "/identity/select",
    { role },
    { role: null },
  );
  expect(response.status).toBe(200);
  return response.body!;
}

async function uploadImage(
  client: Stage1HttpClient,
  source: Buffer,
  originalName: string,
): Promise<MediaSummary> {
  const intent = await client.post<UploadIntent>("/uploads/presign", {
    originalName,
    mimeType: "image/png",
    size: source.byteLength,
  });
  expect(intent.status).toBe(201);
  const uploadPath = intent.body!.uploadUrl.replace(/^\/api\/v1/, "");
  expect((await client.putBinary(uploadPath, source, "image/png")).status).toBe(
    204,
  );
  const completed = await client.request<MediaSummary>("/uploads/complete", {
    method: "POST",
    headers: { "Idempotency-Key": `complete-${intent.body!.uploadId}` },
    body: JSON.stringify({ uploadId: intent.body!.uploadId }),
  });
  expect(completed.status).toBe(200);
  return completed.body!;
}

function downloadExport(
  running: RunningTestApplication,
  exportId: string,
  role: FixedRole,
): Promise<Response> {
  return fetch(`${running.baseUrl}/exports/${exportId}/download`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: "http://127.0.0.1:5173",
      "X-Our-Tomorrow-Role": role,
    },
  });
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimumOffset = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record is missing");
}

function readZipEntries(bytes: Buffer): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(bytes);
  const entryCount = bytes.readUInt16LE(end + 10);
  let centralOffset = bytes.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("ZIP central directory is invalid");
    }
    const compression = bytes.readUInt16LE(centralOffset + 10);
    const compressedSize = bytes.readUInt32LE(centralOffset + 20);
    const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
    const nameLength = bytes.readUInt16LE(centralOffset + 28);
    const extraLength = bytes.readUInt16LE(centralOffset + 30);
    const commentLength = bytes.readUInt16LE(centralOffset + 32);
    const localOffset = bytes.readUInt32LE(centralOffset + 42);
    const name = bytes
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString("utf8");
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("ZIP local entry is invalid");
    }
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const content =
      compression === 0
        ? Buffer.from(compressed)
        : compression === 8
          ? inflateRawSync(compressed)
          : (() => {
              throw new Error(`Unsupported ZIP compression ${compression}`);
            })();
    if (content.byteLength !== uncompressedSize) {
      throw new Error(`ZIP entry ${name} has an invalid size`);
    }
    entries.set(name, content);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function createExport(
  client: Stage1HttpClient,
  format: "ZIP" | "JSON",
  key: string,
) {
  return client.request<ExportJob>("/exports", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ confirmed: true, format }),
  });
}

describe.sequential("stage 5 private data export", () => {
  let databaseUrl: string;
  let prisma: PrismaClient;
  let running: RunningTestApplication;
  let mediaRoot: string;

  beforeAll(async () => {
    databaseUrl = integrationDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    await prisma.$connect();
  }, 60_000);

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    mediaRoot = await fileSystem.mkdtemp(
      path.join(tmpdir(), "our-tomorrow-stage5-export-"),
    );
    running = await startTestApplication(databaseUrl, {
      mediaStoragePath: mediaRoot,
    });
  });

  afterEach(async () => {
    await running?.app.close();
    await fileSystem.rm(mediaRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("keeps jobs and private capsules role-scoped while producing a complete downloadable archive", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const boyIdentity = await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const image = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 211, g: 102, b: 87 },
      },
    })
      .png()
      .toBuffer();

    const sharedMedia = await uploadImage(boy, image, "shared-memory.png");
    const memory = await boy.post<VersionedResource>("/memories", {
      title: "stage5-shared-memory",
      content: "stage5-shared-memory-body",
      happenedAt: "2026-07-16T08:00:00.000Z",
      status: "PUBLISHED",
      mediaIds: [sharedMedia.id],
      coverMediaId: sharedMedia.id,
    });
    expect(memory.status, JSON.stringify(memory.body)).toBe(201);

    const lockedMedia = await uploadImage(
      boy,
      image,
      "locked-secret-image.png",
    );
    const locked = await boy.post<VersionedResource>("/capsules", {
      title: "stage5-locked-capsule",
      type: "TO_BOTH",
      unlockRule: "AT_TIME",
      unlockAt: "2036-07-17T08:00:00.000Z",
      message: "stage5-locked-body-must-not-leak",
      mediaIds: [lockedMedia.id],
    });
    expect(locked.status).toBe(201);
    expect(
      (
        await boy.post<VersionedResource>(`/capsules/${locked.body!.id}/seal`, {
          version: locked.body!.version,
        })
      ).status,
    ).toBe(201);

    const boySelfMedia = await uploadImage(boy, image, "boy-self-only.png");
    expect(
      (
        await boy.post<VersionedResource>("/capsules", {
          title: "stage5-boy-self-title",
          type: "TO_SELF",
          unlockRule: "AT_TIME",
          unlockAt: "2037-07-17T08:00:00.000Z",
          message: "stage5-boy-self-body",
          mediaIds: [boySelfMedia.id],
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await girl.post<VersionedResource>("/capsules", {
          title: "stage5-girl-self-title",
          type: "TO_SELF",
          unlockRule: "AT_TIME",
          unlockAt: "2038-07-17T08:00:00.000Z",
          message: "stage5-girl-self-body",
        })
      ).status,
    ).toBe(201);

    const key = "stage5-export-shared-key";
    const boyCreated = await createExport(boy, "ZIP", key);
    expect(boyCreated).toMatchObject({
      status: 201,
      body: {
        status: "READY",
        format: "ZIP",
        downloadAvailable: true,
      },
    });
    const boyReplay = await createExport(boy, "ZIP", key);
    expect(boyReplay.status).toBe(201);
    expect(boyReplay.body!.id).toBe(boyCreated.body!.id);
    expect(
      await prisma.exportJob.count({
        where: { requestedById: boyIdentity.user.id },
      }),
    ).toBe(1);

    const idempotencyConflict = await createExport(boy, "JSON", key);
    expect(idempotencyConflict).toMatchObject({
      status: 409,
      body: { code: "IDEMPOTENCY_CONFLICT" },
    });

    const girlCreated = await createExport(girl, "JSON", key);
    expect(girlCreated).toMatchObject({
      status: 201,
      body: { status: "READY", format: "JSON" },
    });
    expect(girlCreated.body!.id).not.toBe(boyCreated.body!.id);

    const boyJobs = await boy.get<ExportJob[]>("/exports");
    const girlJobs = await girl.get<ExportJob[]>("/exports");
    expect(boyJobs.body?.map(({ id }) => id)).toEqual([boyCreated.body!.id]);
    expect(girlJobs.body?.map(({ id }) => id)).toEqual([girlCreated.body!.id]);
    expect(
      await girl.get<ApiError>(`/exports/${boyCreated.body!.id}`),
    ).toMatchObject({ status: 404, body: { code: "RESOURCE_NOT_FOUND" } });
    expect(
      await girl.delete<ApiError>(`/exports/${boyCreated.body!.id}`),
    ).toMatchObject({ status: 404, body: { code: "RESOURCE_NOT_FOUND" } });
    expect(
      (await downloadExport(running, boyCreated.body!.id, "girl")).status,
    ).toBe(404);

    const boyDownload = await downloadExport(
      running,
      boyCreated.body!.id,
      "boy",
    );
    expect(boyDownload.status).toBe(200);
    expect(boyDownload.headers.get("content-type")).toContain(
      "application/zip",
    );
    expect(boyDownload.headers.get("content-disposition")).toContain(
      `${boyCreated.body!.id}.zip`,
    );
    const archive = Buffer.from(await boyDownload.arrayBuffer());
    expect(archive.byteLength).toBe(boyCreated.body!.fileSize);
    expect(createHash("sha256").update(archive).digest("hex")).toBe(
      boyCreated.body!.checksumSha256,
    );
    const entries = readZipEntries(archive);
    expect([...entries.keys()].sort()).toEqual(
      expect.arrayContaining(["README.txt", "data.json", "manifest.json"]),
    );
    const manifest = JSON.parse(
      entries.get("manifest.json")!.toString("utf8"),
    ) as ExportManifest;
    const boyData = JSON.parse(
      entries.get("data.json")!.toString("utf8"),
    ) as ExportData;
    expect(manifest).toMatchObject({
      format: "our-tomorrow-export",
      version: 1,
      dataFile: "data.json",
    });
    expect(boyData).toMatchObject({
      format: "our-tomorrow-data",
      version: 1,
      identity: { role: "boy" },
    });
    expect(boyData.memories.map(({ title }) => title)).toContain(
      "stage5-shared-memory",
    );
    expect(JSON.stringify(boyData)).toContain("stage5-boy-self-body");
    expect(JSON.stringify(boyData)).not.toContain("stage5-girl-self");
    expect(JSON.stringify(boyData)).not.toContain(
      "stage5-locked-body-must-not-leak",
    );
    const lockedCapsule = boyData.capsules.find(
      ({ title }) => title === "stage5-locked-capsule",
    );
    expect(lockedCapsule).toMatchObject({ bodyAvailable: false });
    expect(lockedCapsule).not.toHaveProperty("messages");
    expect(lockedCapsule).not.toHaveProperty("media");
    const manifestNames = manifest.media.map(
      ({ originalName }) => originalName,
    );
    expect(manifestNames).toEqual(
      expect.arrayContaining(["shared-memory.png", "boy-self-only.png"]),
    );
    expect(manifestNames).not.toContain("locked-secret-image.png");
    for (const item of manifest.media) {
      expect(entries.get(item.file)?.byteLength.toString()).toBe(item.size);
    }
    expect(entries.has(`media/${sharedMedia.id}/shared-memory.png`)).toBe(true);

    const girlDownload = await downloadExport(
      running,
      girlCreated.body!.id,
      "girl",
    );
    expect(girlDownload.status).toBe(200);
    const girlData = JSON.parse(await girlDownload.text()) as ExportData;
    expect(girlData).toMatchObject({
      identity: { role: "girl" },
      media: [
        expect.objectContaining({
          id: sharedMedia.id,
          originalName: "shared-memory.png",
        }),
      ],
    });
    const girlSerialized = JSON.stringify(girlData);
    expect(girlSerialized).toContain("stage5-girl-self-body");
    expect(girlSerialized).not.toContain("stage5-boy-self");
    expect(girlSerialized).not.toContain("locked-secret-image.png");
    expect(girlSerialized).not.toContain("stage5-locked-body-must-not-leak");

    const status = await boy.get<Record<string, unknown>>(
      "/settings/data-status",
    );
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      backup: { status: "UNKNOWN" },
      storage: { available: true },
      exports: { enabled: true, formatVersion: 1, retentionDays: 7 },
    });
    expect(JSON.stringify(status.body)).not.toContain(mediaRoot);

    const storageKey = `exports/${boyCreated.body!.id}.zip`;
    const storedPath = path.join(mediaRoot, storageKey);
    expect((await fileSystem.stat(storedPath)).isFile()).toBe(true);
    expect(
      await boy.delete<void>(`/exports/${boyCreated.body!.id}`),
    ).toMatchObject({ status: 204 });
    await expect(fileSystem.stat(storedPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      await boy.get<ExportJob>(`/exports/${boyCreated.body!.id}`),
    ).toMatchObject({
      status: 200,
      body: {
        status: "EXPIRED",
        checksumSha256: null,
        fileSize: null,
        downloadAvailable: false,
      },
    });
    expect(
      (await downloadExport(running, boyCreated.body!.id, "boy")).status,
    ).toBe(409);
  }, 120_000);
});
