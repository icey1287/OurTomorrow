import { ConfigService } from "@nestjs/config";
import type { PrismaClient } from "@prisma/client";
import { io, type Socket } from "socket.io-client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { Clock } from "../src/common/clock/clock";
import type { Environment } from "../src/config/env.schema";
import { PrismaService } from "../src/database/prisma.service";
import type { RealtimeEvent } from "../src/realtime/realtime.gateway";
import { RealtimeRelayService } from "../src/realtime/realtime-relay.service";
import { SchedulerWorkerService } from "../src/scheduler/scheduler-worker.service";
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

type ApiError = { code: string; message: string };
type IdentitySession = { user: { id: string }; couple: { id: string } };
type CurrentStatusView = {
  id: string;
  version: number;
  kind: string;
  message: string | null;
};
type StatusesResponse = {
  serverNow: string;
  mine: CurrentStatusView | null;
  partner: CurrentStatusView | null;
};
type MoodView = {
  id: string;
  version: number;
  mood: string;
  visibleToPartner: boolean;
};
type MoodMonth = { mine: MoodView[]; partner: MoodView[] };
type NoteView =
  | {
      id: string;
      status: "SCHEDULED";
      showAt: string;
      isPlaceholder: true;
    }
  | {
      id: string;
      version: number;
      status: string;
      content: string;
      keepAfterViewed: boolean;
      isPlaceholder: false;
    };
type NotesResponse = { serverNow: string; items: NoteView[] };
type DailyDetail = {
  date: string;
  timezone: string;
  prompt: { id: string; text: string };
  status: string;
  mine: null | {
    answer: string;
    version: number;
    status: string;
    postscript: string | null;
  };
  partner:
    | { submitted: boolean }
    | {
        submitted: true;
        answer: string;
        postscript: string | null;
      };
};
type NotificationPage = {
  items: Array<{ id: string; type: string; status: string }>;
  nextCursor: string | null;
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

function waitForSocketEvent<T>(
  socket: Socket,
  eventName: string,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(eventName, onEvent);
  });
}

describe.sequential("stage 3 daily presence and private exchange", () => {
  let databaseUrl: string;
  let prisma: PrismaClient;
  let running: RunningTestApplication;

  beforeAll(async () => {
    databaseUrl = integrationDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    await prisma.$connect();
  }, 60_000);

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    running = await startTestApplication(databaseUrl);
  });

  afterEach(async () => {
    await running?.app.close();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function worker(): SchedulerWorkerService {
    return new SchedulerWorkerService(
      running.app.get(ConfigService<Environment, true>),
      running.app.get(PrismaService),
      running.app.get(Clock),
    );
  }

  test("status and mood visibility follow server time and partner privacy", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const expiry = new Date(Date.now() + 10 * 60_000).toISOString();

    const status = await girl.put<CurrentStatusView>("/statuses/me", {
      kind: "BUSY",
      message: "正在收尾今天的事情",
      mood: "专注",
      scene: "办公室",
      needsResponse: true,
      expiresAt: expiry,
    });
    expect(status.status).toBe(200);
    expect(
      (await boy.get<StatusesResponse>("/statuses/current")).body,
    ).toMatchObject({
      mine: null,
      partner: {
        id: status.body!.id,
        kind: "BUSY",
        message: "正在收尾今天的事情",
      },
    });
    expect(
      (await boy.get<{ partnerStatus: CurrentStatusView | null }>("/today"))
        .body?.partnerStatus?.id,
    ).toBe(status.body!.id);

    const today = await girl.get<{ localDate: string }>("/today");
    const month = today.body!.localDate.slice(0, 7);
    const hiddenMood = await girl.put<MoodView>("/moods/today", {
      mood: "有一点疲惫",
      note: "只给自己看",
      visibleToPartner: false,
      wantsResponse: false,
    });
    expect(hiddenMood.status).toBe(200);
    expect(
      (await boy.get<MoodMonth>(`/moods?month=${month}`)).body?.partner,
    ).toEqual([]);

    const visibleMood = await girl.put<MoodView>("/moods/today", {
      version: hiddenMood.body!.version,
      mood: "慢慢安心",
      note: "现在可以告诉你",
      visibleToPartner: true,
      wantsResponse: true,
    });
    expect(visibleMood.status).toBe(200);
    expect(
      (await boy.get<MoodMonth>(`/moods?month=${month}`)).body?.partner,
    ).toMatchObject([{ mood: "慢慢安心", visibleToPartner: true }]);
    const hiddenAgain = await girl.put<MoodView>("/moods/today", {
      version: visibleMood.body!.version,
      mood: "重新只留给自己",
      note: "对方缓存也必须撤回",
      visibleToPartner: false,
      wantsResponse: false,
    });
    expect(hiddenAgain.status).toBe(200);
    expect(
      (await boy.get<MoodMonth>(`/moods?month=${month}`)).body?.partner,
    ).toEqual([]);
    const hiddenEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: hiddenAgain.body!.id,
        eventType: "mood_entry.hidden",
      },
      select: { payload: true },
    });
    expect(hiddenEvent).not.toBeNull();
    expect(JSON.stringify(hiddenEvent?.payload)).not.toContain(
      "重新只留给自己",
    );
    expect(JSON.stringify(hiddenEvent?.payload)).not.toContain(
      "对方缓存也必须撤回",
    );

    const now = new Date();
    const startsAt = new Date(now.getTime() - 120_000);
    const expiresAt = new Date(now.getTime() - 60_000);
    await prisma.currentStatus.update({
      where: { id: status.body!.id },
      data: { startsAt, expiresAt },
    });
    await prisma.scheduledEvent.update({
      where: { dedupeKey: `current-status:${status.body!.id}:expire` },
      data: { runAt: expiresAt },
    });
    await worker().poll();
    expect(
      (await boy.get<StatusesResponse>("/statuses/current")).body?.partner,
    ).toBeNull();

    const notifications = await boy.get<NotificationPage>("/notifications");
    expect(notifications.body!.items.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "STATUS_RESPONSE_REQUESTED",
        "MOOD_RESPONSE_REQUESTED",
      ]),
    );
  });

  test("a scheduled surprise stays redacted until the persistent worker reveals it", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const showAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const secret = "今晚回家以后看窗外。";

    const created = await girl.post<NoteView>("/notes", {
      type: "SURPRISE",
      content: secret,
      showAt,
      keepAfterViewed: false,
    });
    expect(created.status).toBe(201);
    const before = await boy.get<NotesResponse>("/notes?scope=received");
    expect(before.body?.items).toMatchObject([
      {
        id: created.body!.id,
        status: "SCHEDULED",
        isPlaceholder: true,
      },
    ]);
    expect(JSON.stringify(before.body)).not.toContain(secret);

    const dueAt = new Date(Date.now() - 1_000);
    await prisma.note.update({
      where: { id: created.body!.id },
      data: { showAt: dueAt },
    });
    await prisma.scheduledEvent.update({
      where: { dedupeKey: `note:${created.body!.id}:show` },
      data: { runAt: dueAt },
    });
    await worker().poll();

    const visible = await boy.get<NotesResponse>("/notes?scope=received");
    expect(visible.body?.items).toMatchObject([
      {
        id: created.body!.id,
        status: "VISIBLE",
        content: secret,
        isPlaceholder: false,
      },
    ]);
    const visibleNote = visible.body!.items[0]!;
    if (visibleNote.isPlaceholder) throw new Error("note was not revealed");
    const viewed = await boy.post<NoteView>(
      `/notes/${visibleNote.id}/mark-viewed`,
      { version: visibleNote.version },
    );
    expect(viewed.body).toMatchObject({
      status: "ARCHIVED",
      isPlaceholder: false,
    });
    expect(
      (await boy.get<NotesResponse>("/notes?scope=received")).body?.items,
    ).toEqual([]);
    expect(
      (
        await boy.get<NotesResponse>(
          "/notes?scope=received&includeArchived=true",
        )
      ).body?.items,
    ).toEqual([]);
    expect((await boy.get<ApiError>(`/notes/${visibleNote.id}`)).status).toBe(
      404,
    );
    expect(
      (await boy.get<NotificationPage>("/notifications")).body!.items.map(
        ({ type }) => type,
      ),
    ).toContain("NOTE_VISIBLE");
    expect(
      await prisma.outboxEvent.count({ where: { status: "PUBLISHED" } }),
    ).toBeGreaterThan(0);
  });

  test("an expired running lease is reclaimed once and repeated polls do not duplicate reveal side effects", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const created = await boy.post<NoteView>("/notes", {
      type: "SURPRISE",
      content: "租约恢复后只揭晓一次。",
      showAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    expect(created.status).toBe(201);

    const now = new Date();
    const dueAt = new Date(now.getTime() - 5_000);
    const staleLockedAt = new Date(now.getTime() - 60_000);
    const staleLockedUntil = new Date(now.getTime() - 30_000);
    await prisma.note.update({
      where: { id: created.body!.id },
      data: { showAt: dueAt },
    });
    const staleEvent = await prisma.scheduledEvent.update({
      where: { dedupeKey: `note:${created.body!.id}:show` },
      data: {
        runAt: dueAt,
        status: "RUNNING",
        attempts: 1,
        lockedAt: staleLockedAt,
        lockedUntil: staleLockedUntil,
        lockedBy: "crashed-worker",
      },
      select: { id: true },
    });

    const firstWorker = worker();
    const secondWorker = worker();
    await Promise.all([firstWorker.poll(), secondWorker.poll()]);
    await Promise.all([firstWorker.poll(), secondWorker.poll()]);

    expect(
      (await girl.get<NotesResponse>("/notes?scope=received")).body?.items,
    ).toMatchObject([
      {
        id: created.body!.id,
        status: "VISIBLE",
        content: "租约恢复后只揭晓一次。",
        isPlaceholder: false,
      },
    ]);
    expect(
      await prisma.scheduledEvent.findUnique({
        where: { id: staleEvent.id },
        select: {
          status: true,
          attempts: true,
          lockedAt: true,
          lockedUntil: true,
          lockedBy: true,
        },
      }),
    ).toEqual({
      status: "COMPLETED",
      attempts: 2,
      lockedAt: null,
      lockedUntil: null,
      lockedBy: null,
    });
    expect(
      await prisma.notification.count({
        where: {
          dedupeKey: `note:${created.body!.id}:visible`,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: created.body!.id,
          eventType: "note.visible",
        },
      }),
    ).toBe(1);
  });

  test("exchange diary answers stay secret until the second atomic submit", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const initial = await boy.get<DailyDetail>("/daily-entries/today");
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      status: "DRAFT",
      mine: null,
      partner: { submitted: false },
    });

    const boyDraft = await boy.put<DailyDetail>("/daily-entries/today", {
      answer: "看到晚霞的时候想起了你。",
    });
    const boySubmitted = await boy.post<DailyDetail>(
      "/daily-entries/today/submit",
      { version: boyDraft.body!.mine!.version },
    );
    expect(boySubmitted.body?.status).toBe("WAITING_FOR_PARTNER");

    const hidden = await girl.get<DailyDetail>("/daily-entries/today");
    expect(hidden.body?.partner).toEqual({ submitted: true });
    expect(JSON.stringify(hidden.body)).not.toContain(
      "看到晚霞的时候想起了你。",
    );

    const girlDraft = await girl.put<DailyDetail>("/daily-entries/today", {
      answer: "路过花店的时候想起了你。",
    });
    const revealed = await girl.post<DailyDetail>(
      "/daily-entries/today/submit",
      { version: girlDraft.body!.mine!.version },
    );
    expect(revealed.body).toMatchObject({
      status: "REVEALED",
      mine: { answer: "路过花店的时候想起了你。" },
      partner: {
        submitted: true,
        answer: "看到晚霞的时候想起了你。",
      },
    });

    const boyRevealed = await boy.get<DailyDetail>("/daily-entries/today");
    expect(boyRevealed.body?.partner).toMatchObject({
      submitted: true,
      answer: "路过花店的时候想起了你。",
    });
    const postscript = await boy.post<DailyDetail>(
      "/daily-entries/today/postscript",
      {
        version: boyRevealed.body!.mine!.version,
        postscript: "原来我们在不同地方看见了同一种温柔。",
      },
    );
    expect(postscript.body?.mine?.postscript).toContain("同一种温柔");

    const locked = await boy.put<ApiError>("/daily-entries/today", {
      version: postscript.body!.mine!.version,
      answer: "试图改写已揭晓正文",
    });
    expect(locked.status).toBe(423);
    expect(locked.body?.code).toBe("CONTENT_LOCKED");
  });

  test("published outbox events reach only the server-derived realtime identity room", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const socket = io(new URL(running.baseUrl).origin, {
      path: "/socket",
      transports: ["websocket"],
      auth: { role: "girl" },
      extraHeaders: { Origin: "http://127.0.0.1:5173" },
      forceNew: true,
      reconnection: false,
    });

    try {
      await waitForSocketEvent(socket, "realtime.ready");
      const eventPromise = waitForSocketEvent<RealtimeEvent>(
        socket,
        "domain.event",
      );
      const status = await boy.put<CurrentStatusView>("/statuses/me", {
        kind: "MISS_YOU",
        message: "忽然很想你",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      expect(status.status).toBe(200);

      await worker().poll();
      await running.app.get(RealtimeRelayService).poll();
      const event = await eventPromise;
      expect(event).toMatchObject({
        type: "current_status.updated",
        resourceId: status.body!.id,
      });
      expect(event).not.toHaveProperty("content");
      expect(event).not.toHaveProperty("message");
    } finally {
      socket.disconnect();
    }
  });
});
