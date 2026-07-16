import type { PrismaClient } from "@prisma/client";
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

type ApiError = {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
  path: string;
  details?: Record<string, string[]>;
};

type UserSummary = {
  id: string;
  version: number;
  displayName: string;
  role: FixedRole;
  slot: 1 | 2;
  nicknameInRelationship: string | null;
  avatarUrl: string | null;
};

type CoupleSummary = {
  id: string;
  version: number;
  name: string;
  startDate: string;
  timezone: string;
  signature: string | null;
  theme: "system" | "light" | "dark";
  members: UserSummary[];
};

type IdentitySession = {
  role: FixedRole;
  user: UserSummary;
  couple: CoupleSummary;
};

type TodayResponse = {
  serverNow: string;
  localDate: string;
  greeting: string;
  relationship: CoupleSummary & { daysTogether: number };
  partnerStatus: null;
  latestNote: null;
  dailyEntryStatus: null;
  nextAnniversary: null;
  randomMemory: null;
  activeWish: null;
};

function localDateIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

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
  expect(response.body).not.toBeNull();
  return response.body!;
}

async function currentIdentity(
  client: Stage1HttpClient,
): Promise<IdentitySession> {
  const response = await client.get<IdentitySession>("/identity/me");
  expect(response.status).toBe(200);
  expect(response.body).not.toBeNull();
  return response.body!;
}

async function currentCouple(client: Stage1HttpClient): Promise<CoupleSummary> {
  const response = await client.get<CoupleSummary>("/couples/current");
  expect(response.status).toBe(200);
  expect(response.body).not.toBeNull();
  return response.body!;
}

describe.sequential("stage 1 fixed two-person identity", () => {
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

  test("selecting either fixed role materializes the same deterministic couple", async () => {
    const client = new Stage1HttpClient(running.baseUrl);
    const boy = await selectIdentity(client, "boy");
    const girl = await selectIdentity(client, "girl");

    expect(boy).toMatchObject({
      role: "boy",
      user: {
        displayName: "甲",
        nicknameInRelationship: "甲",
        role: "boy",
        slot: 1,
      },
      couple: {
        name: "我们的明天",
        startDate: "2024-01-01",
        timezone: "Asia/Shanghai",
        signature: "今天也一起认真生活。",
      },
    });
    expect(girl).toMatchObject({
      role: "girl",
      user: {
        displayName: "乙",
        nicknameInRelationship: "乙",
        role: "girl",
        slot: 2,
      },
    });
    expect(girl.couple.id).toBe(boy.couple.id);
    expect(boy.user.id).not.toBe(girl.user.id);
    expect(boy.couple.members).toEqual([
      expect.objectContaining({ role: "boy", slot: 1, displayName: "甲" }),
      expect.objectContaining({ role: "girl", slot: 2, displayName: "乙" }),
    ]);

    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.couple.count()).toBe(1);
    expect(await prisma.coupleMember.count()).toBe(2);
  });

  test("identity selection is concurrent, idempotent, and stable across restart", async () => {
    const results = await Promise.all(
      ["boy", "girl"].map((role) =>
        new Stage1HttpClient(running.baseUrl).post<IdentitySession>(
          "/identity/select",
          { role },
          { role: null },
        ),
      ),
    );

    expect(results.map(({ status }) => status)).toEqual([200, 200]);
    const boy = results.find(({ body }) => body?.role === "boy")!.body!;
    const girl = results.find(({ body }) => body?.role === "girl")!.body!;
    expect(new Set(results.map(({ body }) => body?.couple.id))).toEqual(
      new Set([boy.couple.id]),
    );
    expect(await prisma.user.count()).toBe(2);
    expect(await prisma.couple.count()).toBe(1);
    expect(await prisma.coupleMember.count()).toBe(2);

    await running.app.close();
    running = await startTestApplication(databaseUrl);
    const restartedBoy = await selectIdentity(
      new Stage1HttpClient(running.baseUrl),
      "boy",
    );
    const restartedGirl = await selectIdentity(
      new Stage1HttpClient(running.baseUrl),
      "girl",
    );
    expect(restartedBoy.user.id).toBe(boy.user.id);
    expect(restartedGirl.user.id).toBe(girl.user.id);
    expect(restartedBoy.couple.id).toBe(boy.couple.id);
  });

  test("select returns identity data without creating browser authentication state", async () => {
    const client = new Stage1HttpClient(running.baseUrl);
    const response = await client.post<IdentitySession>(
      "/identity/select",
      { role: "boy" },
      { role: null },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.body).not.toHaveProperty("csrfToken");

    const withoutHeader = await client.get<ApiError>("/identity/me");
    expect(withoutHeader.status).toBe(400);
    expect(withoutHeader.body?.code).toBe("IDENTITY_REQUIRED");

    client.setRole("boy");
    expect((await currentIdentity(client)).role).toBe("boy");
  });

  test("identity endpoints reject missing, invalid, and unknown role input", async () => {
    const client = new Stage1HttpClient(running.baseUrl);

    const missing = await client.get<ApiError>("/identity/me");
    expect(missing.status).toBe(400);
    expect(missing.body?.code).toBe("IDENTITY_REQUIRED");

    const invalidHeader = await client.request<ApiError>(
      "/identity/me",
      { headers: { "X-Our-Tomorrow-Role": "admin" } },
      { role: null },
    );
    expect(invalidHeader.status).toBe(400);
    expect(invalidHeader.body?.code).toBe("IDENTITY_REQUIRED");

    const invalidBody = await client.post<ApiError>(
      "/identity/select",
      { role: "admin" },
      { role: null },
    );
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body?.code).toBe("VALIDATION_FAILED");

    const unknownField = await client.post<ApiError>(
      "/identity/select",
      { role: "boy", coupleId: "forged" },
      { role: null },
    );
    expect(unknownField.status).toBe(400);
    expect(unknownField.body?.code).toBe("VALIDATION_FAILED");
  });

  test("changing the explicit role header switches persona but keeps the shared space", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");

    const client = new Stage1HttpClient(running.baseUrl, "boy");
    const boy = await currentIdentity(client);
    client.setRole("girl");
    const girl = await currentIdentity(client);

    expect(girl.role).toBe("girl");
    expect(girl.user.id).not.toBe(boy.user.id);
    expect(girl.couple.id).toBe(boy.couple.id);
    expect(girl.couple.members).toEqual(boy.couple.members);
  });

  test("both fixed roles read and update the same couple", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const before = await currentCouple(boy);

    const update = await boy.patch<CoupleSummary>("/couples/current", {
      version: before.version,
      signature: "今天也一起好好生活。",
      theme: "dark",
    });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({
      id: before.id,
      version: before.version + 1,
      signature: "今天也一起好好生活。",
      theme: "dark",
    });

    const seenByGirl = await currentCouple(girl);
    expect(seenByGirl).toEqual(update.body);
  });

  test("couple updates use optimistic concurrency across the two roles", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "girl");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const current = await currentCouple(boy);

    const [left, right] = await Promise.all([
      boy.patch<CoupleSummary | ApiError>("/couples/current", {
        version: current.version,
        signature: "甲更新的签名",
      }),
      girl.patch<CoupleSummary | ApiError>("/couples/current", {
        version: current.version,
        signature: "天更新的签名",
      }),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const conflict = [left, right].find(({ status }) => status === 409)!;
    expect((conflict.body as ApiError).code).toBe("STATE_CONFLICT");
    expect((await currentCouple(boy)).version).toBe(current.version + 1);
  });

  test("profile updates affect only the selected role and advance member summaries", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const boyIdentity = await currentIdentity(boy);
    const coupleBefore = await currentCouple(boy);

    const update = await boy.patch<UserSummary>("/users/me", {
      version: boyIdentity.user.version,
      displayName: "新甲",
      nicknameInRelationship: "小甲",
    });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({
      role: "boy",
      displayName: "新甲",
      nicknameInRelationship: "小甲",
      version: boyIdentity.user.version + 1,
    });

    const girlIdentity = await currentIdentity(girl);
    expect(girlIdentity.user).toMatchObject({
      role: "girl",
      displayName: "乙",
      nicknameInRelationship: "乙",
    });
    expect(girlIdentity.couple.version).toBe(coupleBefore.version + 1);
    expect(girlIdentity.couple.members).toEqual([
      expect.objectContaining({
        role: "boy",
        displayName: "新甲",
        nicknameInRelationship: "小甲",
      }),
      expect.objectContaining({
        role: "girl",
        displayName: "乙",
        nicknameInRelationship: "乙",
      }),
    ]);
  });

  test("profile updates reject stale versions and forged space or role fields", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const identity = await selectIdentity(bootstrap, "girl");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");

    const first = await girl.patch<UserSummary>("/users/me", {
      version: identity.user.version,
      displayName: "新乙",
    });
    expect(first.status).toBe(200);

    const stale = await girl.patch<ApiError>("/users/me", {
      version: identity.user.version,
      displayName: "过期覆盖",
    });
    expect(stale.status).toBe(409);
    expect(stale.body?.code).toBe("STATE_CONFLICT");

    const forged = await girl.patch<ApiError>("/users/me", {
      version: first.body!.version,
      displayName: "伪造",
      role: "boy",
      coupleId: identity.couple.id,
    });
    expect(forged.status).toBe(400);
    expect(forged.body?.code).toBe("VALIDATION_FAILED");
  });

  test("all role-scoped business endpoints require the explicit role header", async () => {
    const client = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(client, "boy");

    const requests: Array<Promise<HttpResult<ApiError>>> = [
      client.get<ApiError>("/identity/me"),
      client.get<ApiError>("/couples/current"),
      client.patch<ApiError>("/couples/current", { version: 1 }),
      client.patch<ApiError>("/users/me", { version: 1 }),
      client.get<ApiError>("/today"),
    ];
    const responses = await Promise.all(requests);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body?.code).toBe("IDENTITY_REQUIRED");
    }
  });

  test("today uses the server clock and the shared couple timezone", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const couple = await currentCouple(boy);

    const update = await girl.patch<CoupleSummary>("/couples/current", {
      version: couple.version,
      timezone: "Pacific/Kiritimati",
    });
    expect(update.status).toBe(200);

    const before = Date.now();
    const boyToday = await boy.get<TodayResponse>("/today");
    const girlToday = await girl.get<TodayResponse>("/today");
    const after = Date.now();
    expect(boyToday.status).toBe(200);
    expect(girlToday.status).toBe(200);

    const serverInstant = new Date(boyToday.body!.serverNow);
    expect(serverInstant.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(serverInstant.getTime()).toBeLessThanOrEqual(after + 1_000);
    const expectedLocalDate = localDateIn("Pacific/Kiritimati", serverInstant);
    const expectedDays = Math.max(
      1,
      Math.floor(
        (dateOrdinal(expectedLocalDate) - dateOrdinal("2024-01-01")) /
          86_400_000,
      ) + 1,
    );
    expect(boyToday.body).toMatchObject({
      localDate: expectedLocalDate,
      relationship: {
        id: couple.id,
        timezone: "Pacific/Kiritimati",
        daysTogether: expectedDays,
      },
    });
    expect(girlToday.body!.relationship).toEqual(boyToday.body!.relationship);
  });
});
