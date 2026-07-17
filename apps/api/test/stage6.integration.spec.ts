import {
  MemoryStatus,
  TouchEventKind,
  WishStatus,
  type PrismaClient,
} from "@prisma/client";
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
import { AnnualReviewsService } from "../src/annual-reviews/annual-reviews.service";
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

type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type IdentitySession = {
  user: { id: string; role: FixedRole };
  couple: { id: string; timezone: string };
};

type TouchEventView = {
  id: string;
  kind: string;
  direction: "SENT" | "RECEIVED";
};

type CalmLetterDetail = {
  id: string;
  version: number;
  direction: "SENT" | "RECEIVED";
  status: "LOCKED" | "AVAILABLE" | "OPENED" | "ARCHIVED";
  bodyAvailable: boolean;
  canOpen: boolean;
  content?: string;
};

type MemoryCard = {
  id: string;
  title: string;
  isFirstTime: boolean;
};

type MemoryDetail = MemoryCard & {
  version: number;
  status: string;
};

type MemoryResurfaceView = {
  id: string;
  localDate: string;
  openedAt: string | null;
  dismissedAt: string | null;
  memory: MemoryCard | null;
};

type MemoryResurfaceToday = {
  serverNow: string;
  localDate: string;
  box: MemoryResurfaceView | null;
};

type Paginated<T> = {
  items: T[];
  meta: { nextCursor: string | null; hasMore: boolean };
};

type PlaceView = {
  id: string;
  version: number;
  historyState: "UNVISITED" | "VISITED" | "LIVED";
  futureState: "NONE" | "WANT_TO_GO" | "PLANNED" | "DEPARTING" | "COMPLETED";
  firstVisitedAt: string | null;
};

type WishDetail = {
  id: string;
  version: number;
  status: string;
  completedAt: string | null;
  plan: null | {
    id: string;
    version: number;
    status: string;
    completedAt: string | null;
  };
};

type UploadIntent = {
  uploadId: string;
  uploadUrl: string;
};

type MediaSummary = {
  id: string;
  originalName: string;
};

type TagSummary = {
  id: string;
};

type AnnualReviewView = {
  id: string;
  year: number;
  status: "DRAFT" | "GENERATING" | "READY" | "PUBLISHED";
  version: number;
  statistics: {
    memories: number;
    places: number;
    completedWishes: number;
    photos: number;
  };
  keywords: string[];
  contributions: Array<{
    role: FixedRole;
    selectedMedia: MediaSummary | null;
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
  originalName: string,
  background: string,
): Promise<MediaSummary> {
  const source = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
  const intent = await client.post<UploadIntent>("/uploads/presign", {
    originalName,
    mimeType: "image/png",
    size: source.byteLength,
  });
  expect(intent.status).toBe(201);
  expect(
    (
      await client.putBinary(
        intent.body!.uploadUrl.replace(/^\/api\/v1/, ""),
        source,
        "image/png",
      )
    ).status,
  ).toBe(204);
  const completed = await client.request<MediaSummary>("/uploads/complete", {
    method: "POST",
    headers: {
      "Idempotency-Key": `stage6-upload-${intent.body!.uploadId}`,
    },
    body: JSON.stringify({ uploadId: intent.body!.uploadId }),
  });
  expect(completed.status).toBe(200);
  return completed.body!;
}

describe.sequential("stage 6 romantic enhancement", () => {
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
      path.join(tmpdir(), "our-tomorrow-stage6-"),
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

  test("touch signals derive the fixed partner and enforce payload, concurrency, cooldown and hourly limits", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const boyIdentity = await selectIdentity(bootstrap, "boy");
    const girlIdentity = await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");

    const rejectedMessage = await boy.post<ApiError>("/touch-events", {
      kind: "HUG",
      message: "the server must reject free-form touch text",
    });
    expect(rejectedMessage).toMatchObject({
      status: 400,
      body: { code: "VALIDATION_FAILED" },
    });
    expect(rejectedMessage.body?.details).toHaveProperty("message");

    const concurrent = await Promise.all([
      boy.post<TouchEventView>("/touch-events", { kind: "HUG" }),
      boy.post<TouchEventView | ApiError>("/touch-events", { kind: "CHEER" }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 429]);
    const created = concurrent.find(({ status }) => status === 201);
    const cooldown = concurrent.find(({ status }) => status === 429);
    expect(created?.body).toMatchObject({ direction: "SENT" });
    expect(cooldown?.body).toMatchObject({
      code: "RATE_LIMITED",
      details: { reason: "COOLDOWN" },
    });

    const stored = await prisma.touchEvent.findFirstOrThrow({
      where: { coupleId: boyIdentity.couple.id },
    });
    expect(stored).toMatchObject({
      senderId: boyIdentity.user.id,
      recipientId: girlIdentity.user.id,
      message: null,
    });
    const notification = await prisma.notification.findFirstOrThrow({
      where: {
        coupleId: boyIdentity.couple.id,
        recipientId: girlIdentity.user.id,
        type: "TOUCH_EVENT_RECEIVED",
      },
    });
    expect(notification.payload).toMatchObject({ kind: stored.kind });
    expect(JSON.stringify(notification.payload)).not.toContain(
      "the server must reject free-form touch text",
    );
    expect(await prisma.touchEvent.count()).toBe(1);

    await prisma.touchEvent.deleteMany({
      where: { coupleId: boyIdentity.couple.id },
    });
    const now = new Date();
    await prisma.touchEvent.createMany({
      data: Array.from({ length: 12 }, (_, index) => {
        const createdAt = new Date(now.getTime() - (index + 2) * 60_000);
        return {
          id: randomUUID(),
          coupleId: boyIdentity.couple.id,
          senderId: boyIdentity.user.id,
          recipientId: girlIdentity.user.id,
          kind: TouchEventKind.HUG,
          createdAt,
          deliveredAt: createdAt,
        };
      }),
    });

    const hourlyLimited = await boy.post<ApiError>("/touch-events", {
      kind: "MISS_YOU",
    });
    expect(hourlyLimited).toMatchObject({
      status: 429,
      body: {
        code: "RATE_LIMITED",
        details: { reason: "HOURLY_LIMIT" },
      },
    });
    expect(await prisma.touchEvent.count()).toBe(12);
  });

  test("calm letters keep recipient content locked until the due instant and an explicit open", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const secret = "stage6-calm-letter-body-must-stay-locked";

    const created = await boy.post<CalmLetterDetail>("/calm-letters", {
      purpose: "DISCUSS_LATER",
      content: secret,
      unlockAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      direction: "SENT",
      status: "LOCKED",
      bodyAvailable: true,
      content: secret,
    });

    const locked = await girl.get<CalmLetterDetail>(
      `/calm-letters/${created.body!.id}`,
    );
    expect(locked.body).toMatchObject({
      direction: "RECEIVED",
      status: "LOCKED",
      bodyAvailable: false,
      canOpen: false,
    });
    expect(locked.body).not.toHaveProperty("content");
    expect(
      JSON.stringify((await girl.get("/calm-letters")).body),
    ).not.toContain(secret);

    const earlyOpen = await girl.post<ApiError>(
      `/calm-letters/${created.body!.id}/open`,
      { version: locked.body!.version },
    );
    expect(earlyOpen).toMatchObject({
      status: 423,
      body: { code: "CONTENT_LOCKED" },
    });
    expect(JSON.stringify(earlyOpen.body)).not.toContain(secret);

    await prisma.calmLetter.update({
      where: { id: created.body!.id },
      data: { unlockAt: new Date(Date.now() - 60_000) },
    });
    const available = await girl.get<CalmLetterDetail>(
      `/calm-letters/${created.body!.id}`,
    );
    expect(available.body).toMatchObject({
      status: "AVAILABLE",
      bodyAvailable: false,
      canOpen: true,
    });
    expect(available.body).not.toHaveProperty("content");

    const opened = await girl.post<CalmLetterDetail>(
      `/calm-letters/${created.body!.id}/open`,
      { version: available.body!.version },
    );
    expect(opened.status).toBeLessThan(300);
    expect(opened.body).toMatchObject({
      status: "OPENED",
      bodyAvailable: true,
      canOpen: false,
      content: secret,
    });
    expect(
      (await girl.get<CalmLetterDetail>(`/calm-letters/${created.body!.id}`))
        .body,
    ).toMatchObject({ content: secret });
  });

  test("both roles share one unopened daily blind box and first-times stay published and couple-scoped", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const boyIdentity = await selectIdentity(bootstrap, "boy");
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const publishedFirst = await boy.post<MemoryDetail>("/memories", {
      title: "固定空间里的第一次看海",
      content: "只有打开盲盒后才可以被返回。",
      happenedAt: "2025-01-01T10:30:00.000Z",
      isFirstTime: true,
      firstTimeLabel: "第一次一起看海",
      status: "PUBLISHED",
    });
    const draftFirst = await boy.post<MemoryDetail>("/memories", {
      title: "仍是私人草稿的第一次",
      happenedAt: "2025-09-01T10:30:00.000Z",
      isFirstTime: true,
      firstTimeLabel: "第一次私人草稿",
      status: "DRAFT",
    });
    const ordinary = await girl.post<MemoryDetail>("/memories", {
      title: "普通的共同回忆",
      happenedAt: "2025-10-01T10:30:00.000Z",
      status: "PUBLISHED",
    });
    for (const response of [publishedFirst, draftFirst, ordinary]) {
      expect(response.status).toBe(201);
    }

    const outsiderUserId = randomUUID();
    const outsiderCoupleId = randomUUID();
    const outsiderMemoryId = randomUUID();
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: outsiderUserId,
          username: `stage6-outsider-${outsiderUserId}`,
          displayName: "隔离空间成员",
        },
      }),
      prisma.couple.create({
        data: {
          id: outsiderCoupleId,
          name: "另一个空间",
          startDate: new Date("2024-01-01T00:00:00.000Z"),
          timezone: "Asia/Shanghai",
        },
      }),
    ]);
    await prisma.memory.create({
      data: {
        id: outsiderMemoryId,
        coupleId: outsiderCoupleId,
        createdById: outsiderUserId,
        title: "另一个空间的第一次",
        happenedAt: new Date("2025-08-01T00:00:00.000Z"),
        isFirstTime: true,
        firstTimeLabel: "第一次不该越界",
        status: MemoryStatus.PUBLISHED,
      },
    });

    const [boyToday, girlToday] = await Promise.all([
      boy.get<MemoryResurfaceToday>("/memory-resurfaces/today"),
      girl.get<MemoryResurfaceToday>("/memory-resurfaces/today"),
    ]);
    expect(boyToday.status).toBe(200);
    expect(girlToday.status).toBe(200);
    expect(boyToday.body?.box?.id).toBe(girlToday.body?.box?.id);
    expect(boyToday.body?.localDate).toBe(girlToday.body?.localDate);
    expect(boyToday.body?.box?.memory).toBeNull();
    expect(girlToday.body?.box?.memory).toBeNull();
    const unopenedJson = JSON.stringify([boyToday.body, girlToday.body]);
    for (const title of [publishedFirst.body!.title, ordinary.body!.title]) {
      expect(unopenedJson).not.toContain(title);
    }
    expect(
      await prisma.memoryResurface.count({
        where: { coupleId: boyIdentity.couple.id },
      }),
    ).toBe(1);

    const opened = await boy.post<MemoryResurfaceView>(
      `/memory-resurfaces/${boyToday.body!.box!.id}/open`,
    );
    expect(opened.status).toBeLessThan(300);
    expect(opened.body?.memory?.id).toEqual(
      expect.stringMatching(
        new RegExp(`^(${publishedFirst.body!.id}|${ordinary.body!.id})$`),
      ),
    );
    const girlAfterOpen = await girl.get<MemoryResurfaceToday>(
      "/memory-resurfaces/today",
    );
    expect(girlAfterOpen.body?.box?.id).toBe(opened.body?.id);
    expect(girlAfterOpen.body?.box?.memory?.id).toBe(opened.body?.memory?.id);

    const [boyMuseum, girlMuseum] = await Promise.all([
      boy.get<Paginated<MemoryCard>>("/memories/first-times?limit=20"),
      girl.get<Paginated<MemoryCard>>("/memories/first-times?limit=20"),
    ]);
    const expectedIds = [publishedFirst.body!.id];
    expect(boyMuseum.body?.items.map(({ id }) => id)).toEqual(expectedIds);
    expect(girlMuseum.body?.items.map(({ id }) => id)).toEqual(expectedIds);
    expect(JSON.stringify([boyMuseum.body, girlMuseum.body])).not.toContain(
      draftFirst.body!.title,
    );
    expect(JSON.stringify([boyMuseum.body, girlMuseum.body])).not.toContain(
      outsiderMemoryId,
    );
  });

  test("dual-axis places stay independent and linked wish-plan completion migrates all state atomically", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const dualPlace = await boy.post<PlaceView>("/places", {
      name: "住过但还想再去的城市",
      latitude: 31.2304,
      longitude: 121.4737,
      historyState: "UNVISITED",
      futureState: "WANT_TO_GO",
    });
    expect(dualPlace.status).toBe(201);
    const dualUpdated = await girl.patch<PlaceView>(
      `/places/${dualPlace.body!.id}/status`,
      { version: dualPlace.body!.version, historyState: "LIVED" },
    );
    expect(dualUpdated.body).toMatchObject({
      historyState: "LIVED",
      futureState: "WANT_TO_GO",
    });

    const journeyPlace = await boy.post<PlaceView>("/places", {
      name: "准备一起抵达的海边",
      historyState: "UNVISITED",
      futureState: "PLANNED",
    });
    const wish = await boy.post<WishDetail>("/wishes", {
      title: "一起抵达海边",
      category: "TRAVEL",
      placeId: journeyPlace.body!.id,
    });
    const planned = await girl.post<WishDetail>(
      `/wishes/${wish.body!.id}/plan`,
      {
        version: wish.body!.version,
        title: "海边同行计划",
        placeId: journeyPlace.body!.id,
        startsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      },
    );
    const started = await boy.post<WishDetail>(
      `/wishes/${wish.body!.id}/start`,
      { version: planned.body!.version },
    );
    const completedAt = new Date(Date.now() - 60_000);
    const completed = await girl.post<WishDetail>(
      `/wishes/${wish.body!.id}/complete`,
      {
        version: started.body!.version,
        completedAt: completedAt.toISOString(),
      },
    );
    expect(completed.body).toMatchObject({
      status: "COMPLETED",
      completedAt: completedAt.toISOString(),
      plan: {
        status: "COMPLETED",
        completedAt: completedAt.toISOString(),
      },
    });

    const stored = await prisma.wish.findUniqueOrThrow({
      where: { id: wish.body!.id },
      include: { plan: true, place: true },
    });
    expect(stored.status).toBe(WishStatus.COMPLETED);
    expect(stored.completedAt?.toISOString()).toBe(completedAt.toISOString());
    expect(stored.plan).toMatchObject({ status: "COMPLETED" });
    expect(stored.plan?.completedAt?.toISOString()).toBe(
      completedAt.toISOString(),
    );
    expect(stored.place).toMatchObject({
      historyState: "VISITED",
      futureState: "COMPLETED",
    });
    expect(stored.place?.firstVisitedAt?.toISOString()).toBe(
      completedAt.toISOString(),
    );
  });

  test("annual review generation counts only published yearly content and accepts only that year's published memory media", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const boyIdentity = await selectIdentity(bootstrap, "boy");
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const reviewYear = 2025;

    const publicMedia = await uploadImage(
      boy,
      "stage6-public-year.png",
      "#d97757",
    );
    const draftMedia = await uploadImage(
      boy,
      "stage6-private-draft.png",
      "#334155",
    );
    const outsideMedia = await uploadImage(
      boy,
      "stage6-outside-year.png",
      "#2563eb",
    );
    const publicTag = await boy.post<TagSummary>("/tags", {
      name: "公开年度",
    });
    const privateTag = await boy.post<TagSummary>("/tags", {
      name: "私人草稿",
    });
    const place = await boy.post<PlaceView>("/places", {
      name: "年度公开地点",
      historyState: "VISITED",
      futureState: "NONE",
    });

    const published = await boy.post<MemoryDetail>("/memories", {
      title: "年度公开回忆",
      happenedAt: `${reviewYear}-06-01T10:00:00.000Z`,
      status: "PUBLISHED",
      placeId: place.body!.id,
      tagIds: [publicTag.body!.id],
      mediaIds: [publicMedia.id],
      coverMediaId: publicMedia.id,
    });
    const draft = await boy.post<MemoryDetail>("/memories", {
      title: "年度私人草稿",
      happenedAt: `${reviewYear}-07-01T10:00:00.000Z`,
      status: "DRAFT",
      tagIds: [privateTag.body!.id],
      mediaIds: [draftMedia.id],
      coverMediaId: draftMedia.id,
    });
    const outsideYear = await boy.post<MemoryDetail>("/memories", {
      title: "其他年份公开回忆",
      happenedAt: `${reviewYear - 1}-07-01T10:00:00.000Z`,
      status: "PUBLISHED",
      mediaIds: [outsideMedia.id],
      coverMediaId: outsideMedia.id,
    });
    for (const response of [published, draft, outsideYear]) {
      expect(response.status).toBe(201);
    }

    await prisma.wish.createMany({
      data: [
        {
          coupleId: boyIdentity.couple.id,
          createdById: boyIdentity.user.id,
          completedById: boyIdentity.user.id,
          title: "年度内已完成愿望",
          status: WishStatus.COMPLETED,
          completedAt: new Date(`${reviewYear}-09-01T10:00:00.000Z`),
        },
        {
          coupleId: boyIdentity.couple.id,
          createdById: boyIdentity.user.id,
          completedById: boyIdentity.user.id,
          title: "其他年份已完成愿望",
          status: WishStatus.COMPLETED,
          completedAt: new Date(`${reviewYear - 1}-09-01T10:00:00.000Z`),
        },
      ],
    });

    const requested = await boy.post<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
    );
    expect(requested.status).toBeLessThan(300);
    expect(requested.body).toMatchObject({ status: "GENERATING" });
    await running.app
      .get(AnnualReviewsService)
      .generate(
        boyIdentity.couple.id,
        requested.body!.id,
        new Date(`${reviewYear + 1}-07-17T00:00:00.000Z`),
      );

    const ready = await boy.get<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
    );
    expect(ready.body).toMatchObject({
      status: "READY",
      statistics: {
        memories: 1,
        places: 1,
        completedWishes: 1,
        photos: 1,
      },
      keywords: ["公开年度"],
    });
    expect(JSON.stringify(ready.body)).not.toContain("私人草稿");

    const mediaOptions = await boy.get<MediaSummary[]>(
      `/annual-reviews/${reviewYear}/media-options`,
    );
    expect(mediaOptions.status).toBe(200);
    expect(mediaOptions.body?.map(({ id }) => id)).toEqual([publicMedia.id]);

    for (const selectedMediaId of [draftMedia.id, outsideMedia.id]) {
      const rejected = await boy.patch<ApiError>(
        `/annual-reviews/${reviewYear}`,
        { version: ready.body!.version, selectedMediaId },
      );
      expect(rejected).toMatchObject({
        status: 400,
        body: { code: "VALIDATION_FAILED" },
      });
    }

    const updated = await boy.patch<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
      { version: ready.body!.version, selectedMediaId: publicMedia.id },
    );
    expect(updated.status).toBe(200);
    expect(
      updated.body?.contributions.find(({ role }) => role === "boy")
        ?.selectedMedia?.id,
    ).toBe(publicMedia.id);

    const laterMemory = await boy.post<MemoryDetail>("/memories", {
      title: "同一年后来补上的公开回忆",
      happenedAt: `${reviewYear}-11-01T10:00:00.000Z`,
      status: "PUBLISHED",
    });
    expect(laterMemory.status).toBe(201);
    const regenerating = await boy.post<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
    );
    expect(regenerating.body?.status).toBe("GENERATING");
    await running.app
      .get(AnnualReviewsService)
      .generate(
        boyIdentity.couple.id,
        regenerating.body!.id,
        new Date(`${reviewYear + 1}-07-17T00:00:00.000Z`),
      );
    const refreshed = await boy.get<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
    );
    expect(refreshed.body?.statistics.memories).toBe(2);
    expect(
      refreshed.body?.contributions.find(({ role }) => role === "boy")
        ?.selectedMedia?.id,
    ).toBe(publicMedia.id);

    const publishedReview = await boy.post<AnnualReviewView>(
      `/annual-reviews/${reviewYear}/publish`,
      { version: refreshed.body!.version },
    );
    expect(publishedReview.body?.status).toBe("PUBLISHED");
    const afterPublishMemory = await boy.post<MemoryDetail>("/memories", {
      title: "发布后不再改写年度书的回忆",
      happenedAt: `${reviewYear}-12-01T10:00:00.000Z`,
      status: "PUBLISHED",
    });
    expect(afterPublishMemory.status).toBe(201);
    const frozen = await boy.post<AnnualReviewView>(
      `/annual-reviews/${reviewYear}`,
    );
    expect(frozen.body).toMatchObject({
      status: "PUBLISHED",
      statistics: { memories: 2 },
    });
  });
});
