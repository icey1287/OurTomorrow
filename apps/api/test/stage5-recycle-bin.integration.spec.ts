import { ConfigService } from "@nestjs/config";
import {
  MediaStatus,
  RecycleBinItemStatus,
  RecycleBinResourceType,
  RecycleBinVisibility,
  type PrismaClient,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
import {
  FIXED_COUPLE_ID,
  FIXED_IDENTITIES,
} from "../src/identity/identity.constants";
import { PlansService } from "../src/plans/plans.service";
import { RecycleBinService } from "../src/recycle-bin/recycle-bin.service";
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

type IdentitySession = { user: { id: string }; couple: { id: string } };
type WishDetail = {
  id: string;
  version: number;
  status: string;
  plan: null | { id: string; status: string };
};
type NoteView = {
  id: string;
  version: number;
  status: string;
  content: string;
};
type CapsuleDetail = { id: string; version: number; status: string };
type PlaceSummary = { id: string; version: number; name: string };
type RecycleItem = {
  id: string;
  resourceType: string;
  resourceId: string;
  status: string;
  visibility: string;
};
type RecyclePage = { items: RecycleItem[] };
type RestoreResult = {
  id: string;
  resourceType: string;
  resourceId: string;
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

describe.sequential("stage 5 recycle bin", () => {
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
      path.join(tmpdir(), "our-tomorrow-stage5-recycle-"),
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

  test("a shared wish and its linked plan are transactionally recycled and restored by either partner", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const wish = await boy.post<WishDetail>("/wishes", {
      title: "一起坐夜车去海边",
      description: "这段正文绝不能复制进回收记录",
      category: "TRAVEL",
    });
    expect(wish.status).toBe(201);
    const startsAt = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
    const planned = await girl.post<WishDetail>(
      `/wishes/${wish.body!.id}/plan`,
      {
        version: wish.body!.version,
        startsAt,
        reminderAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      },
    );
    expect(planned.body).toMatchObject({ status: "PLANNED" });

    expect(
      (
        await boy.delete(
          `/wishes/${wish.body!.id}?version=${planned.body!.version}`,
        )
      ).status,
    ).toBe(204);
    expect((await girl.get(`/wishes/${wish.body!.id}`)).status).toBe(404);

    const recycle = await girl.get<RecyclePage>("/recycle-bin?type=wish");
    expect(recycle.status).toBe(200);
    expect(recycle.body!.items).toHaveLength(1);
    expect(recycle.body!.items[0]).toMatchObject({
      resourceType: "WISH",
      resourceId: wish.body!.id,
      visibility: "SHARED",
    });
    const stored = await prisma.recycleBinItem.findUnique({
      where: { id: recycle.body!.items[0]!.id },
      select: { restoreData: true },
    });
    expect(JSON.stringify(stored?.restoreData)).not.toContain("夜车");
    expect(JSON.stringify(stored?.restoreData)).not.toContain("正文");

    const restored = await girl.post<RestoreResult>(
      `/recycle-bin/${recycle.body!.items[0]!.id}/restore`,
    );
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      resourceType: "WISH",
      resourceId: wish.body!.id,
    });
    const detail = await boy.get<WishDetail>(`/wishes/${wish.body!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      status: "PLANNED",
      plan: { id: planned.body!.plan!.id, status: "SCHEDULED" },
    });
    expect(
      await prisma.scheduledEvent.count({
        where: {
          coupleId: FIXED_COUPLE_ID,
          dedupeKey: `plan:${planned.body!.plan!.id}:reminder`,
          status: "PENDING",
        },
      }),
    ).toBe(1);
  });

  test("draft notes, draft capsules, and unbound media stay visible only to their owner", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const note = await boy.post<NoteView>("/notes", {
      type: "SURPRISE",
      content: "私人的便利贴草稿",
      publish: false,
    });
    expect(note.body).toMatchObject({ status: "DRAFT" });
    expect(
      (
        await boy.delete(
          `/notes/${note.body!.id}?version=${note.body!.version}`,
        )
      ).status,
    ).toBe(204);

    const capsule = await boy.post<CapsuleDetail>("/capsules", {
      title: "写给未来的自己",
      type: "TO_SELF",
      unlockRule: "AT_TIME",
      unlockAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      message: "只有我自己能看到",
    });
    expect(
      (
        await boy.delete(
          `/capsules/${capsule.body!.id}?version=${capsule.body!.version}`,
        )
      ).status,
    ).toBe(204);

    const mediaId = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id: mediaId,
        coupleId: FIXED_COUPLE_ID,
        createdById: FIXED_IDENTITIES.boy.userId,
        storageKey: `media/${mediaId.slice(0, 2)}/${mediaId}/original.webp`,
        originalName: "private.webp",
        mimeType: "image/webp",
        kind: "IMAGE",
        status: MediaStatus.READY,
        size: 16n,
        readyAt: new Date(),
      },
    });
    expect((await boy.delete(`/media/${mediaId}`)).status).toBe(204);

    expect((await girl.get<RecyclePage>("/recycle-bin")).body!.items).toEqual(
      [],
    );
    const ownerItems = (await boy.get<RecyclePage>("/recycle-bin")).body!.items;
    expect(ownerItems.map((item) => item.resourceType).sort()).toEqual([
      "CAPSULE",
      "MEDIA",
      "NOTE",
    ]);
    expect(ownerItems.every((item) => item.visibility === "OWNER_ONLY")).toBe(
      true,
    );
    expect(
      (
        await girl.post(
          `/recycle-bin/${ownerItems.find((item) => item.resourceType === "NOTE")!.id}/restore`,
        )
      ).status,
    ).toBe(404);

    for (const item of ownerItems) {
      expect((await boy.post(`/recycle-bin/${item.id}/restore`)).status).toBe(
        200,
      );
    }
    expect(
      (await boy.get<NoteView>(`/notes/${note.body!.id}`)).body,
    ).toMatchObject({ content: "私人的便利贴草稿", status: "DRAFT" });
    expect(
      await prisma.mediaAsset.count({
        where: { id: mediaId, status: MediaStatus.READY, deletedAt: null },
      }),
    ).toBe(1);
  });

  test("foreign-space recycle IDs are hidden and permanent deletion remains delayed", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");

    const foreignUserId = randomUUID();
    const foreignCoupleId = randomUUID();
    const foreignItemId = randomUUID();
    await prisma.user.create({
      data: {
        id: foreignUserId,
        username: `foreign-${foreignUserId}`,
        displayName: "Foreign",
      },
    });
    await prisma.couple.create({
      data: {
        id: foreignCoupleId,
        name: "Foreign space",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
      },
    });
    await prisma.recycleBinItem.create({
      data: {
        id: foreignItemId,
        coupleId: foreignCoupleId,
        resourceType: RecycleBinResourceType.PLACE,
        resourceId: randomUUID(),
        visibility: RecycleBinVisibility.SHARED,
        deletedById: foreignUserId,
        restoreData: {},
        deletedAt: new Date(),
        retentionUntil: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    expect(
      (await boy.post(`/recycle-bin/${foreignItemId}/restore`)).status,
    ).toBe(404);
    expect((await boy.delete(`/recycle-bin/${foreignItemId}`)).status).toBe(
      404,
    );

    const place = await boy.post<PlaceSummary>("/places", {
      name: "等以后再去的地方",
      status: "WANT_TO_GO",
    });
    expect(
      (
        await boy.delete(
          `/places/${place.body!.id}?version=${place.body!.version}`,
        )
      ).status,
    ).toBe(204);
    const item = await prisma.recycleBinItem.findFirstOrThrow({
      where: {
        coupleId: FIXED_COUPLE_ID,
        resourceType: RecycleBinResourceType.PLACE,
        resourceId: place.body!.id,
      },
    });
    expect((await boy.delete(`/recycle-bin/${item.id}`)).status).toBe(202);
    expect(await prisma.place.count({ where: { id: place.body!.id } })).toBe(1);
    const pending = await prisma.recycleBinItem.findUniqueOrThrow({
      where: { id: item.id },
      select: { status: true, purgeAfter: true, retentionUntil: true },
    });
    expect(pending.status).toBe(RecycleBinItemStatus.PURGE_PENDING);
    expect(pending.purgeAfter).not.toBeNull();
    expect(pending.purgeAfter!.getTime()).toBeLessThanOrEqual(
      pending.retentionUntil.getTime(),
    );
    expect(pending.purgeAfter!.getTime()).toBeGreaterThan(Date.now());
    expect(
      await prisma.scheduledEvent.count({
        where: {
          dedupeKey: `recycle-bin:${item.id}:purge`,
          runAt: pending.purgeAfter!,
          status: "PENDING",
        },
      }),
    ).toBe(1);
  });

  test("the durable worker physically purges expired resources exactly once", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const place = await boy.post<PlaceSummary>("/places", {
      name: "过期测试地点",
    });
    await boy.delete(
      `/places/${place.body!.id}?version=${place.body!.version}`,
    );
    const item = await prisma.recycleBinItem.findFirstOrThrow({
      where: {
        resourceType: RecycleBinResourceType.PLACE,
        resourceId: place.body!.id,
      },
    });
    const due = new Date(Date.now() - 1_000);
    await prisma.$transaction([
      prisma.recycleBinItem.update({
        where: { id: item.id },
        data: { retentionUntil: due },
      }),
      prisma.scheduledEvent.update({
        where: { dedupeKey: `recycle-bin:${item.id}:purge` },
        data: {
          runAt: due,
          status: "PENDING",
          attempts: 0,
          lockedAt: null,
          lockedUntil: null,
          lockedBy: null,
        },
      }),
    ]);

    const worker = new SchedulerWorkerService(
      running.app.get(ConfigService<Environment, true>),
      running.app.get(PrismaService),
      running.app.get(Clock),
      running.app.get(PlansService),
      running.app.get(AnniversariesService),
      running.app.get(CapsulesService),
      running.app.get(RecycleBinService),
    );
    await worker.poll();
    await worker.poll();

    expect(await prisma.place.count({ where: { id: place.body!.id } })).toBe(0);
    expect(
      await prisma.recycleBinItem.count({
        where: { id: item.id, status: RecycleBinItemStatus.PURGED },
      }),
    ).toBe(1);
    expect(
      await prisma.scheduledEvent.count({
        where: {
          dedupeKey: `recycle-bin:${item.id}:purge`,
          status: "COMPLETED",
        },
      }),
    ).toBe(1);
  });
});
