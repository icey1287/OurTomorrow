import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@prisma/client";
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
import { AnniversariesService } from "../src/anniversaries/anniversaries.service";
import { CapsulesService } from "../src/capsules/capsules.service";
import { Clock } from "../src/common/clock/clock";
import type { Environment } from "../src/config/env.schema";
import { PrismaService } from "../src/database/prisma.service";
import { PlansService } from "../src/plans/plans.service";
import { SchedulerWorkerService } from "../src/scheduler/scheduler-worker.service";
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
type IdentitySession = {
  user: { id: string; role: FixedRole };
  couple: { id: string; version: number; timezone: string };
};
type WishDetail = {
  id: string;
  version: number;
  status: string;
  title: string;
  plan: null | { id: string; version: number; status: string };
  convertedMemoryId: string | null;
};
type PlanSummary = {
  id: string;
  version: number;
  status: string;
  reminderAt: string | null;
};
type AnniversarySummary = {
  id: string;
  version: number;
  nextOccurrenceLocalDate: string | null;
};
type AnniversaryReminder = {
  id: string;
  nextRunAt: string | null;
};
type CapsuleDetail = {
  id: string;
  version: number;
  status: string;
  title: string;
  bodyAvailable: boolean;
  canOpen: boolean;
  messages?: Array<{ content: string }>;
  media?: MediaSummary[];
};
type MemoryDetail = { id: string; title: string; content: string | null };
type NoteView = {
  id: string;
  version: number;
  status: string;
  isPlaceholder: false;
};
type UploadIntent = {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
};
type MediaSummary = {
  id: string;
  originalName: string;
  url: string;
  thumbnailUrl: string;
};
type TodayResponse = {
  activeWish: WishDetail | null;
  nextAnniversary: AnniversarySummary | null;
};
type TodayUpcoming = {
  anniversaries: AnniversarySummary[];
  plans: PlanSummary[];
  capsules: Array<Record<string, unknown>>;
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

function postIdempotent<T>(
  client: Stage1HttpClient,
  route: string,
  body: unknown,
  key: string,
): Promise<HttpResult<T>> {
  return client.request<T>(route, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

function apiOrigin(running: RunningTestApplication): string {
  return new URL(running.baseUrl).origin;
}

function fetchPrivateMedia(
  running: RunningTestApplication,
  url: string,
  role: FixedRole,
): Promise<Response> {
  return fetch(`${apiOrigin(running)}${url}`, {
    headers: { "X-Our-Tomorrow-Role": role },
  });
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
  expect(
    (await client.putBinary<void>(uploadPath, source, "image/png")).status,
  ).toBe(204);
  const completed = await postIdempotent<MediaSummary>(
    client,
    "/uploads/complete",
    { uploadId: intent.body!.uploadId },
    `stage4-upload-${intent.body!.uploadId}`,
  );
  expect(completed.status).toBe(200);
  return completed.body!;
}

describe.sequential("stage 4 shared tomorrow", () => {
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
      path.join(tmpdir(), "our-tomorrow-stage4-"),
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

  function worker(): SchedulerWorkerService {
    return new SchedulerWorkerService(
      running.app.get(ConfigService<Environment, true>),
      running.app.get(PrismaService),
      running.app.get(Clock),
      running.app.get(PlansService),
      running.app.get(AnniversariesService),
      running.app.get(CapsulesService),
    );
  }

  test("a wish completes, wakes its capsule and converts to exactly one memory", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const wish = await boy.post<WishDetail>("/wishes", {
      title: "一起去看海",
      description: "等一场日落",
      expectation: "慢慢走",
      category: "TRAVEL",
    });
    expect(wish.status).toBe(201);
    expect((await girl.get<TodayResponse>("/today")).body?.activeWish?.id).toBe(
      wish.body!.id,
    );

    const capsule = await boy.post<CapsuleDetail>("/capsules", {
      title: "等我们看到海",
      type: "TO_BOTH",
      unlockRule: "WISH_COMPLETION",
      wishId: wish.body!.id,
      message: "这一刻真的到来时，要记得好好抱抱。",
    });
    const sealed = await boy.post<CapsuleDetail>(
      `/capsules/${capsule.body!.id}/seal`,
      { version: capsule.body!.version },
    );
    expect(sealed.body).toMatchObject({ status: "LOCKED" });

    const startsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const planned = await girl.post<WishDetail>(
      `/wishes/${wish.body!.id}/plan`,
      {
        version: wish.body!.version,
        startsAt,
        reminderAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    );
    expect(planned.body).toMatchObject({ status: "PLANNED" });
    const started = await boy.post<WishDetail>(
      `/wishes/${wish.body!.id}/start`,
      { version: planned.body!.version },
    );
    expect(started.body).toMatchObject({ status: "IN_PROGRESS" });
    const completed = await girl.post<WishDetail>(
      `/wishes/${wish.body!.id}/complete`,
      {
        version: started.body!.version,
        completionNote: "终于一起看到了。",
      },
    );
    expect(completed.body).toMatchObject({ status: "COMPLETED" });
    expect(
      await prisma.scheduledEvent.count({
        where: {
          dedupeKey: `capsule:${capsule.body!.id}:due`,
          type: "CAPSULE_DUE",
        },
      }),
    ).toBe(1);

    await worker().poll();
    expect(
      (await boy.get<CapsuleDetail>(`/capsules/${capsule.body!.id}`)).body,
    ).toMatchObject({ status: "UNLOCKED", bodyAvailable: false });

    const request = { version: completed.body!.version };
    const ambiguousTime = await postIdempotent<ApiError>(
      boy,
      `/wishes/${wish.body!.id}/convert-to-memory`,
      { ...request, happenedAt: "2026-07-17T12:00:00" },
      "wish-convert-ambiguous-time",
    );
    expect(ambiguousTime.status).toBe(400);
    const [left, right] = await Promise.all([
      postIdempotent<MemoryDetail>(
        boy,
        `/wishes/${wish.body!.id}/convert-to-memory`,
        request,
        "wish-convert-a",
      ),
      postIdempotent<MemoryDetail>(
        boy,
        `/wishes/${wish.body!.id}/convert-to-memory`,
        request,
        "wish-convert-b",
      ),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 201]);
    expect(left.body!.id).toBe(right.body!.id);
    expect(
      await prisma.memory.count({
        where: { sourceWishId: wish.body!.id, deletedAt: null },
      }),
    ).toBe(1);
    const conflict = await postIdempotent<ApiError>(
      boy,
      `/wishes/${wish.body!.id}/convert-to-memory`,
      { ...request, title: "不同请求" },
      "wish-convert-a",
    );
    expect(conflict).toMatchObject({
      status: 409,
      body: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  test("one note can win only one concurrent cross-time conversion", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const note = await boy.post<NoteView>("/notes", {
      type: "DO_TOGETHER",
      content: "周末一起去吃那家小店。",
    });
    expect(note.status).toBe(201);

    const [wish, memory] = await Promise.all([
      postIdempotent<Record<string, unknown> | ApiError>(
        boy,
        `/notes/${note.body!.id}/convert`,
        { targetType: "WISH", category: "FOOD" },
        "note-convert-wish",
      ),
      postIdempotent<Record<string, unknown> | ApiError>(
        boy,
        `/notes/${note.body!.id}/convert`,
        { targetType: "MEMORY" },
        "note-convert-memory",
      ),
    ]);
    expect([wish.status, memory.status].sort()).toEqual([201, 409]);
    expect(
      await prisma.contentConversion.count({
        where: { sourceId: note.body!.id, sourceType: "NOTE" },
      }),
    ).toBe(1);
    expect(
      await prisma.note.findUnique({
        where: { id: note.body!.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ARCHIVED" });
  });

  test("completing a linked plan also persists its wish-completion capsule job", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const wish = await boy.post<WishDetail>("/wishes", {
      title: "一起做一顿晚餐",
    });
    const capsule = await boy.post<CapsuleDetail>("/capsules", {
      title: "做完晚餐再看",
      type: "TO_BOTH",
      unlockRule: "WISH_COMPLETION",
      wishId: wish.body!.id,
      message: "第一次共同完成的菜单。",
    });
    await boy.post<CapsuleDetail>(`/capsules/${capsule.body!.id}/seal`, {
      version: capsule.body!.version,
    });
    const planned = await boy.post<WishDetail>(
      `/wishes/${wish.body!.id}/plan`,
      {
        version: wish.body!.version,
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    );
    const plan = planned.body!.plan!;
    const started = await boy.post<PlanSummary>(`/plans/${plan.id}/start`, {
      version: plan.version,
    });
    const completed = await boy.post<PlanSummary>(
      `/plans/${plan.id}/complete`,
      { version: started.body!.version },
    );
    expect(completed.body).toMatchObject({ status: "COMPLETED" });
    expect(
      await prisma.scheduledEvent.count({
        where: {
          dedupeKey: `capsule:${capsule.body!.id}:due`,
          type: "CAPSULE_DUE",
        },
      }),
    ).toBe(1);
    await worker().poll();
    expect(
      (await boy.get<CapsuleDetail>(`/capsules/${capsule.body!.id}`)).body,
    ).toMatchObject({ status: "UNLOCKED", bodyAvailable: false });
  });

  test("leap-day rules and timezone changes persistently reschedule reminders", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const identity = await selectIdentity(bootstrap, "girl");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const february = await girl.post<AnniversarySummary>("/anniversaries", {
      title: "闰日 · 二月规则",
      date: "2024-02-29",
      repeat: "YEARLY",
      leapDayRule: "FEBRUARY_28",
    });
    const march = await girl.post<AnniversarySummary>("/anniversaries", {
      title: "闰日 · 三月规则",
      date: "2024-02-29",
      repeat: "YEARLY",
      leapDayRule: "MARCH_1",
    });
    expect(february.body!.nextOccurrenceLocalDate).toMatch(/-02-28$/);
    expect(march.body!.nextOccurrenceLocalDate).toMatch(/-03-01$/);

    const reminder = await girl.post<AnniversaryReminder>(
      `/anniversaries/${february.body!.id}/reminders`,
      { daysBefore: 7, minuteOfDay: 540 },
    );
    const before = await prisma.scheduledEvent.findFirst({
      where: {
        type: "ANNIVERSARY_REMINDER",
        payload: { path: ["reminderId"], equals: reminder.body!.id },
      },
      select: { id: true, runAt: true },
    });
    expect(before).not.toBeNull();

    const updated = await girl.patch<{ version: number; timezone: string }>(
      "/couples/current",
      { version: identity.couple.version, timezone: "America/New_York" },
    );
    expect(updated.body).toMatchObject({ timezone: "America/New_York" });
    const after = await prisma.scheduledEvent.findUnique({
      where: { id: before!.id },
      select: { runAt: true },
    });
    expect(after!.runAt.toISOString()).not.toBe(before!.runAt.toISOString());
    expect(
      (await girl.get<TodayResponse>("/today")).body?.nextAnniversary?.id,
    ).toBe(february.body!.id);
  });

  test("a persisted plan reminder is delivered once across repeated worker polls", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const identity = await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const startsAt = new Date(Date.now() + 3 * 60 * 60_000);
    const reminderAt = new Date(Date.now() + 60 * 60_000);
    const created = await boy.post<PlanSummary>("/plans", {
      title: "准备一次晚餐",
      startsAt: startsAt.toISOString(),
      reminderAt: reminderAt.toISOString(),
    });
    const scheduled = await boy.post<PlanSummary>(
      `/plans/${created.body!.id}/schedule`,
      { version: created.body!.version },
    );
    expect(scheduled.body).toMatchObject({ status: "SCHEDULED" });

    const dueAt = new Date(Date.now() - 1_000);
    await prisma.plan.update({
      where: { id: created.body!.id },
      data: { reminderAt: dueAt },
    });
    await prisma.scheduledEvent.update({
      where: { dedupeKey: `plan:${created.body!.id}:reminder` },
      data: { runAt: dueAt },
    });
    const first = worker();
    const second = worker();
    await Promise.all([first.poll(), second.poll()]);
    await Promise.all([first.poll(), second.poll()]);

    expect(
      await prisma.notification.count({
        where: {
          coupleId: identity.couple.id,
          type: "PLAN_REMINDER",
          payload: { path: ["resourceId"], equals: created.body!.id },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: created.body!.id,
          eventType: "plan.reminder.due",
        },
      }),
    ).toBe(1);
  });

  test("capsule body and media stay sealed until each member explicitly opens", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const source = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 95, g: 110, b: 180 },
      },
    })
      .png()
      .toBuffer();
    const media = await uploadImage(boy, source, "胶囊秘密.png");
    const secret = "等到这一天，我们再一起读这句话。";
    const unlockAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const draft = await boy.post<CapsuleDetail>("/capsules", {
      title: "一起开启的信",
      type: "TO_BOTH",
      unlockRule: "AT_TIME",
      unlockAt,
      requiresBothConfirmation: true,
      message: secret,
      mediaIds: [media.id],
    });
    const sealed = await boy.post<CapsuleDetail>(
      `/capsules/${draft.body!.id}/seal`,
      { version: draft.body!.version },
    );
    expect(sealed.body).toMatchObject({ status: "LOCKED" });

    const hidden = await girl.get<CapsuleDetail>(`/capsules/${draft.body!.id}`);
    expect(hidden.body).toMatchObject({ bodyAvailable: false });
    expect(JSON.stringify(hidden.body)).not.toContain(secret);
    expect(JSON.stringify(hidden.body)).not.toContain(media.id);
    expect(JSON.stringify(hidden.body)).not.toContain(media.originalName);
    const launderMemory = await girl.post<ApiError>("/memories", {
      title: "试图洗白胶囊附件",
      happenedAt: new Date(Date.now() - 1_000).toISOString(),
      mediaIds: [media.id],
      coverMediaId: media.id,
    });
    expect(launderMemory.status).toBe(404);
    const launderAnniversary = await girl.post<ApiError>("/anniversaries", {
      title: "试图借纪念日公开附件",
      date: "2026-01-01",
      backgroundMediaId: media.id,
    });
    expect(launderAnniversary.status).toBe(404);
    expect((await fetchPrivateMedia(running, media.url, "boy")).status).toBe(
      404,
    );
    expect(
      (await fetchPrivateMedia(running, media.thumbnailUrl, "girl")).status,
    ).toBe(404);
    const patchLocked = await boy.patch<ApiError>(
      `/capsules/${draft.body!.id}`,
      { version: sealed.body!.version, title: "试图改写" },
    );
    expect(patchLocked.status).toBe(409);

    const upcoming = await girl.get<TodayUpcoming>("/today/upcoming?days=30");
    expect(upcoming.body!.capsules.map(({ id }) => id)).toContain(
      draft.body!.id,
    );
    expect(JSON.stringify(upcoming.body)).not.toContain(secret);
    expect(JSON.stringify(upcoming.body)).not.toContain(media.id);
    expect(JSON.stringify(upcoming.body)).not.toContain(media.originalName);

    const dueAt = new Date(Date.now() - 1_000);
    await prisma.capsule.update({
      where: { id: draft.body!.id },
      data: { dueAt },
    });
    await prisma.scheduledEvent.update({
      where: { dedupeKey: `capsule:${draft.body!.id}:due` },
      data: { runAt: dueAt },
    });
    await worker().poll();
    const due = await boy.get<CapsuleDetail>(`/capsules/${draft.body!.id}`);
    expect(due.body).toMatchObject({ status: "DUE", bodyAvailable: false });

    const [boyConfirmed, girlConfirmed] = await Promise.all([
      boy.post<CapsuleDetail>(`/capsules/${draft.body!.id}/confirm-open`, {
        version: due.body!.version,
      }),
      girl.post<CapsuleDetail>(`/capsules/${draft.body!.id}/confirm-open`, {
        version: due.body!.version,
      }),
    ]);
    expect([boyConfirmed.status, girlConfirmed.status]).toEqual([201, 201]);
    const unlocked = await boy.get<CapsuleDetail>(
      `/capsules/${draft.body!.id}`,
    );
    expect(unlocked.body).toMatchObject({
      status: "UNLOCKED",
      bodyAvailable: false,
    });
    expect(JSON.stringify(unlocked.body)).not.toContain(secret);

    const [openedByBoy, openedByBoyReplay] = await Promise.all([
      boy.post<CapsuleDetail>(`/capsules/${draft.body!.id}/open`, {
        version: unlocked.body!.version,
      }),
      boy.post<CapsuleDetail>(`/capsules/${draft.body!.id}/open`, {
        version: unlocked.body!.version,
      }),
    ]);
    expect([openedByBoy.status, openedByBoyReplay.status]).toEqual([201, 201]);
    expect(openedByBoy.body?.messages?.[0]?.content).toBe(secret);
    expect((await fetchPrivateMedia(running, media.url, "boy")).status).toBe(
      200,
    );
    expect((await fetchPrivateMedia(running, media.url, "girl")).status).toBe(
      404,
    );

    const tooEarly = await postIdempotent<ApiError>(
      boy,
      `/capsules/${draft.body!.id}/convert-to-memory`,
      { version: openedByBoy.body!.version },
      "capsule-convert-too-early",
    );
    expect(tooEarly).toMatchObject({
      status: 409,
      body: { code: "STATE_CONFLICT" },
    });
    const girlBeforeOpen = await girl.get<CapsuleDetail>(
      `/capsules/${draft.body!.id}`,
    );
    expect(girlBeforeOpen.body).toMatchObject({
      status: "OPENED",
      bodyAvailable: false,
      canOpen: true,
    });
    expect(JSON.stringify(girlBeforeOpen.body)).not.toContain(secret);
    const openedByGirl = await girl.post<CapsuleDetail>(
      `/capsules/${draft.body!.id}/open`,
      { version: girlBeforeOpen.body!.version },
    );
    expect(openedByGirl.body?.messages?.[0]?.content).toBe(secret);
    expect((await fetchPrivateMedia(running, media.url, "girl")).status).toBe(
      200,
    );

    const converted = await postIdempotent<MemoryDetail>(
      boy,
      `/capsules/${draft.body!.id}/convert-to-memory`,
      { version: openedByGirl.body!.version },
      "capsule-convert",
    );
    expect(converted.status).toBe(201);
    expect(
      (await girl.get<CapsuleDetail>(`/capsules/${draft.body!.id}`)).body,
    ).toMatchObject({
      status: "CONVERTED_TO_MEMORY",
      bodyAvailable: true,
    });

    const replay = await postIdempotent<MemoryDetail>(
      boy,
      `/capsules/${draft.body!.id}/convert-to-memory`,
      { version: openedByGirl.body!.version },
      "capsule-convert",
    );
    expect(replay).toMatchObject({
      status: 201,
      body: { id: converted.body!.id },
    });
    expect(
      await prisma.memory.count({
        where: { sourceCapsuleId: draft.body!.id, deletedAt: null },
      }),
    ).toBe(1);
  });

  test("TO_SELF and foreign-space resources stay hidden as 404", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const identity = await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const privateCapsule = await boy.post<CapsuleDetail>("/capsules", {
      title: "只写给自己",
      type: "TO_SELF",
      unlockRule: "AT_TIME",
      unlockAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      message: "另一身份永远不应通过胶囊接口看到。",
    });
    expect(
      (await girl.get<ApiError>(`/capsules/${privateCapsule.body!.id}`)).status,
    ).toBe(404);
    const sealedPrivate = await boy.post<CapsuleDetail>(
      `/capsules/${privateCapsule.body!.id}/seal`,
      { version: privateCapsule.body!.version },
    );
    const privateDueAt = new Date(Date.now() - 1_000);
    await prisma.capsule.update({
      where: { id: privateCapsule.body!.id },
      data: { dueAt: privateDueAt },
    });
    await prisma.scheduledEvent.update({
      where: { dedupeKey: `capsule:${privateCapsule.body!.id}:due` },
      data: { runAt: privateDueAt },
    });
    await worker().poll();
    const privateDue = await boy.get<CapsuleDetail>(
      `/capsules/${privateCapsule.body!.id}`,
    );
    const privateOpened = await boy.post<CapsuleDetail>(
      `/capsules/${privateCapsule.body!.id}/open`,
      { version: privateDue.body!.version },
    );
    expect(privateOpened.body).toMatchObject({ bodyAvailable: true });
    const privateConversion = await postIdempotent<ApiError>(
      boy,
      `/capsules/${privateCapsule.body!.id}/convert-to-memory`,
      { version: privateOpened.body!.version },
      "private-capsule-convert",
    );
    expect(privateConversion.status).toBe(403);
    expect(
      await prisma.memory.count({
        where: { sourceCapsuleId: privateCapsule.body!.id },
      }),
    ).toBe(0);
    expect(sealedPrivate.body).toMatchObject({ status: "LOCKED" });

    const foreignCoupleId = randomUUID();
    const foreignWishId = randomUUID();
    await prisma.couple.create({
      data: {
        id: foreignCoupleId,
        name: "隔离测试空间",
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        timezone: "Asia/Shanghai",
      },
    });
    await prisma.wish.create({
      data: {
        id: foreignWishId,
        coupleId: foreignCoupleId,
        title: "其他空间的愿望",
        createdById: identity.user.id,
      },
    });
    expect((await boy.get<ApiError>(`/wishes/${foreignWishId}`)).status).toBe(
      404,
    );
  });
});
