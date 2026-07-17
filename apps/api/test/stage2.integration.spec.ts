import { MediaStatus, MemoryStatus, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

import {
  Stage1HttpClient,
  type FixedRole,
  type HttpResult,
} from "./helpers/http-client";
import {
  createTestPrisma,
  integrationDatabaseUrl,
  resetTestDatabase,
} from "./helpers/test-database";
import {
  startTestApplication,
  type RunningTestApplication,
} from "./helpers/test-app";

type ApiError = { code: string; message: string };
type UserSummary = { id: string; role: FixedRole };
type IdentitySession = {
  user: UserSummary;
  couple: { id: string };
};
type TagSummary = { id: string; version: number; name: string };
type PlaceSummary = { id: string; version: number; name: string };
type UploadIntent = {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
};
type MediaSummary = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
};
type PerspectiveView = {
  author: UserSummary;
  state: "EMPTY" | "DRAFT" | "SUBMITTED";
  editable: boolean;
  version?: number;
  content?: string;
};
type MemoryDetail = {
  id: string;
  version: number;
  title: string;
  content: string | null;
  happenedAt: string;
  coverMedia: MediaSummary | null;
  media: Array<{ asset: MediaSummary }>;
  tags: TagSummary[];
  place: PlaceSummary | null;
  perspectives: PerspectiveView[];
  perspectivesComplete: boolean;
  comments: Array<{ id: string; content: string }>;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
};
type MemoryCard = Pick<
  MemoryDetail,
  "id" | "version" | "title" | "happenedAt" | "perspectivesComplete"
>;
type PaginatedMemories = {
  items: MemoryCard[];
  meta: { nextCursor: string | null; hasMore: boolean };
};
type MemoryRevision = {
  version: number;
  changes: Record<string, { from: unknown; to: unknown }>;
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

function apiOrigin(running: RunningTestApplication): string {
  return new URL(running.baseUrl).origin;
}

async function fetchPrivateMedia(
  running: RunningTestApplication,
  url: string,
  role: FixedRole,
): Promise<Response> {
  return fetch(`${apiOrigin(running)}${url}`, {
    headers: { "X-Our-Tomorrow-Role": role },
  });
}

async function completeUpload(
  client: Stage1HttpClient,
  uploadId: string,
  idempotencyKey: string,
): Promise<HttpResult<MediaSummary | ApiError>> {
  return client.request<MediaSummary | ApiError>("/uploads/complete", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ uploadId }),
  });
}

async function uploadImage(
  client: Stage1HttpClient,
  source: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  originalName = "memory.png",
): Promise<MediaSummary> {
  const intent = await client.post<UploadIntent>("/uploads/presign", {
    originalName,
    mimeType,
    size: source.byteLength,
  });
  expect(intent.status).toBe(201);
  expect(intent.body).toMatchObject({ method: "PUT" });

  const uploadPath = intent.body!.uploadUrl.replace(/^\/api\/v1/, "");
  const accepted = await client.putBinary<void>(uploadPath, source, mimeType);
  expect(accepted.status).toBe(204);

  const key = `stage2-upload-${intent.body!.uploadId}`;
  const completed = await completeUpload(client, intent.body!.uploadId, key);
  expect(completed.status).toBe(200);
  const replay = await completeUpload(client, intent.body!.uploadId, key);
  expect(replay.status).toBe(200);
  expect(replay.body).toEqual(completed.body);
  return completed.body as MediaSummary;
}

describe.sequential("stage 2 memories and private media", () => {
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
      path.join(tmpdir(), "our-tomorrow-stage2-"),
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

  test("both roles complete a scoped memory with private media and find it again", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const tag = await boy.post<TagSummary>("/tags", {
      name: "第一次",
      color: "#d97757",
    });
    const place = await girl.post<PlaceSummary>("/places", {
      name: "海边",
      address: "共同添加的地点",
      latitude: 24.4801,
      longitude: 118.0894,
      status: "FIRST_TIME",
    });
    expect(tag.status).toBe(201);
    expect(place.status).toBe(201);

    const source = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 3,
        background: { r: 221, g: 111, b: 86 },
      },
    })
      .withMetadata({ orientation: 6 })
      .png()
      .toBuffer();
    const media = await uploadImage(boy, source, "image/png", "海边.png");

    expect((await fetchPrivateMedia(running, media.url, "boy")).status).toBe(
      200,
    );
    expect((await fetchPrivateMedia(running, media.url, "girl")).status).toBe(
      404,
    );

    const created = await boy.post<MemoryDetail>("/memories", {
      title: "第一次一起看海",
      content: "傍晚风很大，但我们都舍不得离开。",
      happenedAt: "2025-01-01T10:30:00.000Z",
      placeId: place.body!.id,
      tagIds: [tag.body!.id],
      isFirstTime: true,
      firstTimeLabel: "第一次一起看海",
    });
    expect(created.status).toBe(201);
    expect(created.headers.get("etag")).toBe(`"memory:${created.body!.id}:1"`);

    const bound = await boy.request<MemoryDetail>(
      `/memories/${created.body!.id}/media`,
      {
        method: "POST",
        headers: { "If-Match": `"memory:${created.body!.id}:1"` },
        body: JSON.stringify({
          version: 1,
          mediaIds: [media.id],
          coverMediaId: media.id,
        }),
      },
    );
    expect(bound.status).toBe(201);
    expect(bound.body).toMatchObject({
      version: 2,
      coverMedia: { id: media.id },
    });

    const partnerMedia = await fetchPrivateMedia(running, media.url, "girl");
    expect(partnerMedia.status).toBe(200);
    const processedMetadata = await sharp(
      Buffer.from(await partnerMedia.arrayBuffer()),
    ).metadata();
    expect(processedMetadata).toMatchObject({
      format: "webp",
      width: 3,
      height: 4,
    });
    expect(processedMetadata.exif).toBeUndefined();

    const [boyEdit, girlEdit] = await Promise.all([
      boy.request<MemoryDetail | ApiError>(`/memories/${created.body!.id}`, {
        method: "PATCH",
        headers: { "If-Match": `"memory:${created.body!.id}:2"` },
        body: JSON.stringify({ version: 2, title: "甲写下的海边" }),
      }),
      girl.request<MemoryDetail | ApiError>(`/memories/${created.body!.id}`, {
        method: "PATCH",
        headers: { "If-Match": `"memory:${created.body!.id}:2"` },
        body: JSON.stringify({ version: 2, mood: "安心" }),
      }),
    ]);
    expect([boyEdit.status, girlEdit.status].sort()).toEqual([200, 409]);
    const current = (boyEdit.status === 200 ? boyEdit.body : girlEdit.body) as
      MemoryDetail | undefined;
    expect(current?.version).toBe(3);

    const boyDraft = await boy.put<PerspectiveView>(
      `/memories/${created.body!.id}/perspective`,
      { content: "我一直记得那天的风。", mood: "期待" },
    );
    expect(boyDraft.body).toMatchObject({ state: "DRAFT", version: 1 });

    const hiddenFromGirl = await girl.get<MemoryDetail>(
      `/memories/${created.body!.id}`,
    );
    const boyView = hiddenFromGirl.body!.perspectives.find(
      ({ author }) => author.role === "boy",
    );
    expect(boyView).toEqual(
      expect.objectContaining({ state: "EMPTY", editable: false }),
    );
    expect(boyView).not.toHaveProperty("content");

    const submittedBoy = await boy.post<PerspectiveView>(
      `/memories/${created.body!.id}/perspective/submit`,
      { version: boyDraft.body!.version },
    );
    expect(submittedBoy.body?.state).toBe("SUBMITTED");
    const girlDraft = await girl.put<PerspectiveView>(
      `/memories/${created.body!.id}/perspective`,
      { content: "我偷偷多带了一把伞。", mood: "开心" },
    );
    const submittedGirl = await girl.post<PerspectiveView>(
      `/memories/${created.body!.id}/perspective/submit`,
      { version: girlDraft.body!.version },
    );
    expect(submittedGirl.body?.state).toBe("SUBMITTED");

    const comment = await girl.post<{ id: string }>(
      `/memories/${created.body!.id}/comments`,
      { content: "下次还要一起去。" },
    );
    expect(comment.status).toBe(201);
    const reaction = await boy.put<
      Array<{ emoji: string; count: number; reactedByMe: boolean }>
    >(`/memories/${created.body!.id}/reactions/${encodeURIComponent("❤️")}`);
    expect(reaction.body).toContainEqual({
      emoji: "❤️",
      count: 1,
      reactedByMe: true,
    });

    const complete = await boy.get<MemoryDetail>(
      `/memories/${created.body!.id}`,
    );
    expect(complete.body).toMatchObject({
      version: 3,
      perspectivesComplete: true,
      comments: [{ id: comment.body!.id, content: "下次还要一起去。" }],
    });

    const filtered = await girl.get<PaginatedMemories>(
      `/memories?tagId=${tag.body!.id}&placeId=${place.body!.id}&firstTime=true&perspectiveState=complete&query=${encodeURIComponent("傍晚")}`,
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body!.items.map(({ id }) => id)).toEqual([
      created.body!.id,
    ]);

    const revisions = await boy.get<Array<{ version: number }>>(
      `/memories/${created.body!.id}/revisions`,
    );
    expect(revisions.body!.map(({ version }) => version)).toEqual([3, 2, 1]);

    const random = await girl.get<MemoryCard>("/today/random-memory");
    expect(random.status).toBe(200);
    expect(random.body?.id).toBe(created.body!.id);
    const today = await boy.get<{ randomMemory: MemoryCard | null }>("/today");
    expect(today.body?.randomMemory?.id).toBe(created.body!.id);

    const deleted = await boy.request<void>(
      `/memories/${created.body!.id}?version=3`,
      {
        method: "DELETE",
        headers: { "If-Match": `"memory:${created.body!.id}:3"` },
      },
    );
    expect(deleted.status).toBe(204);
    expect(
      (await girl.get<ApiError>(`/memories/${created.body!.id}`)).status,
    ).toBe(404);
    expect((await fetchPrivateMedia(running, media.url, "girl")).status).toBe(
      404,
    );
    expect(
      (await prisma.memory.findUnique({ where: { id: created.body!.id } }))!
        .deletedAt,
    ).not.toBeNull();
    await expect(
      fileSystem.stat(
        path.join(
          mediaRoot,
          "media",
          media.id.slice(0, 2),
          media.id,
          "original.webp",
        ),
      ),
    ).resolves.toBeDefined();
  });

  test("discarded draft text never enters the shared revision history", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const draft = await boy.post<MemoryDetail>("/memories", {
      title: "还没有公开的草稿",
      content: "只属于草稿的秘密",
      happenedAt: "2025-06-01T08:00:00.000Z",
      status: "DRAFT",
    });
    expect(draft.status).toBe(201);
    expect(
      (await girl.get<ApiError>(`/memories/${draft.body!.id}`)).status,
    ).toBe(404);
    expect(
      (await boy.get<MemoryRevision[]>(`/memories/${draft.body!.id}/revisions`))
        .body,
    ).toEqual([]);

    const published = await boy.request<MemoryDetail>(
      `/memories/${draft.body!.id}`,
      {
        method: "PATCH",
        headers: { "If-Match": `"memory:${draft.body!.id}:1"` },
        body: JSON.stringify({
          version: 1,
          content: "可以共同看到的正文",
          status: "PUBLISHED",
        }),
      },
    );
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      version: 2,
      content: "可以共同看到的正文",
    });

    const revisions = await girl.get<MemoryRevision[]>(
      `/memories/${draft.body!.id}/revisions`,
    );
    expect(revisions.status).toBe(200);
    expect(revisions.body).toHaveLength(1);
    expect(revisions.body![0]).toMatchObject({
      version: 2,
      changes: {
        content: { from: null, to: "可以共同看到的正文" },
        status: { from: null, to: "PUBLISHED" },
      },
    });
    expect(JSON.stringify(revisions.body)).not.toContain("只属于草稿的秘密");
  });

  test("timeline cursors are stable and bound to their filters", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "girl");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    for (const [index, title] of ["最晚", "中间", "最早"].entries()) {
      const response = await girl.post<MemoryDetail>("/memories", {
        title,
        content: "分页测试",
        happenedAt: `2025-07-${String(20 - index).padStart(2, "0")}T08:00:00.000Z`,
      });
      expect(response.status).toBe(201);
    }

    const first = await girl.get<PaginatedMemories>("/memories?limit=1");
    expect(first.body).toMatchObject({ meta: { hasMore: true } });
    const second = await girl.get<PaginatedMemories>(
      `/memories?limit=1&cursor=${encodeURIComponent(first.body!.meta.nextCursor!)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body!.items[0]!.id).not.toBe(first.body!.items[0]!.id);

    const reusedWithDifferentFilter = await girl.get<ApiError>(
      `/memories?limit=1&firstTime=true&cursor=${encodeURIComponent(first.body!.meta.nextCursor!)}`,
    );
    expect(reusedWithDifferentFilter.status).toBe(400);
    expect(reusedWithDifferentFilter.body?.code).toBe("VALIDATION_FAILED");
  });

  test("other-space resources cannot be read or bound", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");

    const externalUserId = randomUUID();
    const externalCoupleId = randomUUID();
    const externalPlaceId = randomUUID();
    const externalTagId = randomUUID();
    const externalMediaId = randomUUID();
    const externalMemoryId = randomUUID();
    await prisma.user.create({
      data: {
        id: externalUserId,
        username: `external-${externalUserId.slice(0, 8)}`,
        displayName: "外部成员",
      },
    });
    await prisma.couple.create({
      data: {
        id: externalCoupleId,
        name: "另一个空间",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        timezone: "Asia/Shanghai",
      },
    });
    await prisma.coupleMember.create({
      data: {
        coupleId: externalCoupleId,
        userId: externalUserId,
        slot: 1,
      },
    });
    await prisma.place.create({
      data: {
        id: externalPlaceId,
        coupleId: externalCoupleId,
        createdById: externalUserId,
        name: "外部地点",
      },
    });
    await prisma.tag.create({
      data: {
        id: externalTagId,
        coupleId: externalCoupleId,
        name: "外部标签",
        normalizedName: "外部标签",
      },
    });
    await prisma.mediaAsset.create({
      data: {
        id: externalMediaId,
        coupleId: externalCoupleId,
        createdById: externalUserId,
        storageKey: `media/${externalMediaId}/original.webp`,
        originalName: "external.webp",
        mimeType: "image/webp",
        kind: "IMAGE",
        status: MediaStatus.READY,
        size: 10,
        readyAt: new Date(),
      },
    });
    await prisma.memory.create({
      data: {
        id: externalMemoryId,
        coupleId: externalCoupleId,
        createdById: externalUserId,
        title: "外部回忆",
        happenedAt: new Date("2025-01-02T00:00:00.000Z"),
        status: MemoryStatus.PUBLISHED,
      },
    });

    expect(
      (await boy.get<ApiError>(`/memories/${externalMemoryId}`)).status,
    ).toBe(404);
    expect(
      (
        await fetchPrivateMedia(
          running,
          `/api/v1/media/${externalMediaId}`,
          "boy",
        )
      ).status,
    ).toBe(404);

    for (const body of [
      { placeId: externalPlaceId },
      { tagIds: [externalTagId] },
      { mediaIds: [externalMediaId], coverMediaId: externalMediaId },
    ]) {
      const response = await boy.post<ApiError>("/memories", {
        title: "不能绑定外部资源",
        happenedAt: "2025-01-03T00:00:00.000Z",
        ...body,
      });
      expect(response.status).toBe(404);
      expect(response.body?.code).toBe("RESOURCE_NOT_FOUND");
    }
  });

  test("MIME spoofing is quarantined instead of becoming readable media", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "girl");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: "#8bc7bf",
      },
    })
      .png()
      .toBuffer();

    const intent = await girl.post<UploadIntent>("/uploads/presign", {
      originalName: "spoofed.jpg",
      mimeType: "image/jpeg",
      size: png.byteLength,
    });
    const uploaded = await girl.putBinary<void>(
      intent.body!.uploadUrl.replace(/^\/api\/v1/, ""),
      png,
      "image/jpeg",
    );
    expect(uploaded.status).toBe(204);

    const completed = await completeUpload(
      girl,
      intent.body!.uploadId,
      `stage2-spoof-${intent.body!.uploadId}`,
    );
    expect(completed.status).toBe(415);
    expect((completed.body as ApiError).code).toBe("UNSUPPORTED_IMAGE");
    expect(
      await prisma.mediaAsset.findUnique({
        where: { id: intent.body!.uploadId },
        select: { status: true },
      }),
    ).toEqual({ status: MediaStatus.QUARANTINED });
    expect(
      (
        await fetchPrivateMedia(
          running,
          `/api/v1/media/${intent.body!.uploadId}`,
          "girl",
        )
      ).status,
    ).toBe(404);
  });
});
