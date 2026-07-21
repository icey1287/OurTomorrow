import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { ApiHttpClient } from "./helpers/api-client";
import {
  createTestPrisma,
  integrationDatabaseUrl,
  resetTestDatabase,
} from "./helpers/test-database";
import {
  startTestApplication,
  type RunningTestApplication,
} from "./helpers/test-app";

type IdentityResponse = {
  role: "boy" | "girl";
  user: { id: string; displayName: string; role: "boy" | "girl" };
  couple: {
    id: string;
    version: number;
    startDate: string;
    signature: string | null;
    members: Array<{ id: string; displayName: string }>;
  };
};

type StatusView = {
  id: string;
  version: number;
  location: string | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

type StatusesResponse = {
  mine: StatusView | null;
  partner: StatusView | null;
};

type NoteView = {
  id: string;
  version: number;
  status: "VISIBLE" | "VIEWED";
  content: string;
  icon: string | null;
  image: { mimeType: string; sizeBytes: number } | null;
  author: { id: string };
  recipient: { id: string };
  readAt: string | null;
};

describe.sequential("the minimal two-person journal", () => {
  let prisma: PrismaClient;
  let application: RunningTestApplication;
  let anonymous: ApiHttpClient;
  let boy: ApiHttpClient;
  let girl: ApiHttpClient;

  beforeAll(async () => {
    const databaseUrl = integrationDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    await prisma.$connect();
    application = await startTestApplication(databaseUrl);
    anonymous = new ApiHttpClient(application.baseUrl);
    boy = new ApiHttpClient(application.baseUrl, "boy");
    girl = new ApiHttpClient(application.baseUrl, "girl");
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await application?.app.close();
    await prisma?.$disconnect();
  });

  async function selectPair() {
    const boyIdentity = await anonymous.post<IdentityResponse>(
      "/identity/resolve",
      { name: "  示例用户甲  " },
    );
    const girlIdentity = await girl.post<IdentityResponse>("/identity/select", {
      role: "girl",
    });
    expect(boyIdentity.status).toBe(200);
    expect(girlIdentity.status).toBe(200);
    return {
      boy: boyIdentity.body!,
      girl: girlIdentity.body!,
    };
  }

  test("keeps only the fixed pair and shared anniversary settings", async () => {
    const rejected = await anonymous.post<{ code: string }>(
      "/identity/resolve",
      { name: "未配置的姓名" },
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body?.code).toBe("IDENTITY_NAME_MISMATCH");

    const identities = await selectPair();
    expect(identities.boy.couple.id).toBe(identities.girl.couple.id);
    expect(
      identities.boy.couple.members.map((member) => member.displayName),
    ).toEqual(["甲", "乙"]);

    const updated = await boy.patch<IdentityResponse["couple"]>(
      "/couples/current",
      {
        version: identities.boy.couple.version,
        startDate: "2024-01-01",
        signature: "今天也一起认真生活。",
      },
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      startDate: "2024-01-01",
      signature: "今天也一起认真生活。",
    });

    const stale = await girl.patch("/couples/current", {
      version: identities.girl.couple.version,
      signature: "旧版本不应覆盖",
    });
    expect(stale.status).toBe(409);
  });

  test("shares one current status with optional precise location", async () => {
    await selectPair();
    const expiresAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
    const created = await boy.put<StatusView>("/statuses/me", {
      kind: "HOME",
      message: "刚到这里，晚一点见。",
      location: "示例地点",
      locationAddress: "示例市示例区示例路1号",
      latitude: 30.123456,
      longitude: 120.123456,
      expiresAt,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      location: "示例地点",
      locationAddress: "示例市示例区示例路1号",
      latitude: 30.123456,
      longitude: 120.123456,
    });

    const visibleToGirl = await girl.get<StatusesResponse>("/statuses/current");
    expect(visibleToGirl.body?.partner?.id).toBe(created.body?.id);

    const missingVersion = await boy.put("/statuses/me", {
      kind: "BUSY",
      location: "办公室",
      expiresAt,
    });
    expect(missingVersion.status).toBe(428);

    const replaced = await boy.put<StatusView>("/statuses/me", {
      kind: "BUSY",
      location: "办公室",
      expiresAt,
      version: created.body!.version,
    });
    expect(replaced.status).toBe(200);

    const cleared = await boy.delete(
      `/statuses/me?version=${replaced.body!.version}`,
    );
    expect(cleared.status).toBe(204);
    const afterClear = await girl.get<StatusesResponse>("/statuses/current");
    expect(afterClear.body?.partner).toBeNull();
  });

  test("stores every note independently and tracks unread state", async () => {
    const identities = await selectPair();
    const imageBytes = Buffer.concat([
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZ4h8AAAAASUVORK5CYII=",
        "base64",
      ),
      Buffer.alloc(120_000),
    ]);
    const imageBase64 = imageBytes.toString("base64");
    const first = await boy.post<NoteView>("/notes", {
      content: "晚饭在等你，我也在等你。",
      icon: "peony",
      image: {
        mimeType: "image/png",
        dataBase64: imageBase64,
      },
    });
    const second = await boy.post<NoteView>("/notes", {
      content: "第二张便笺也要独立保存。",
      icon: "butterfly",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body?.id).not.toBe(second.body?.id);
    expect(first.body?.image).toEqual({
      mimeType: "image/png",
      sizeBytes: imageBytes.length,
    });

    const imageResponse = await fetch(
      `${application.baseUrl}/notes/${first.body!.id}/image`,
      {
        headers: {
          origin: "http://127.0.0.1:5173",
          "x-our-tomorrow-role": "girl",
        },
      },
    );
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(imageBytes);

    const inbox = await girl.get<{ items: NoteView[] }>("/notes");
    expect(inbox.body?.items.map((note) => note.content)).toEqual([
      "第二张便笺也要独立保存。",
      "晚饭在等你，我也在等你。",
    ]);
    expect(inbox.body?.items.every((note) => note.status === "VISIBLE")).toBe(
      true,
    );

    const read = await girl.post<NoteView>(
      `/notes/${first.body!.id}/mark-viewed`,
      { version: first.body!.version },
    );
    expect(read.body).toMatchObject({ status: "VIEWED" });
    expect(read.body?.readAt).toBeTruthy();

    const sent = await boy.get<{ items: NoteView[] }>("/notes");
    expect(
      sent.body?.items.find((note) => note.id === first.body!.id)?.status,
    ).toBe("VIEWED");
    expect(read.body?.recipient.id).toBe(identities.girl.user.id);

    const authorCannotMarkRead = await boy.post(
      `/notes/${second.body!.id}/mark-viewed`,
      { version: second.body!.version },
    );
    expect(authorCannotMarkRead.status).toBe(403);
  });
});
