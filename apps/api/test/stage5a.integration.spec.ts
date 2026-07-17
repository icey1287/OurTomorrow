import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
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

type IdentitySession = {
  user: { id: string; role: FixedRole };
  couple: { id: string };
};

type VersionedResource = {
  id: string;
  version: number;
  status: string;
};

type ApiError = { code: string };

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

function postWithContext<T>(
  client: Stage1HttpClient,
  path: string,
  body: unknown,
  requestId: string,
  idempotencyKey?: string,
): Promise<HttpResult<T>> {
  return client.request<T>(path, {
    method: "POST",
    headers: {
      "x-request-id": requestId,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.sequential("stage 5A request privacy and audit trail", () => {
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
    vi.restoreAllMocks();
    await running?.app.close();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  test("only exact lowercase boy and girl role headers are accepted", async () => {
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    await selectIdentity(bootstrap, "boy");

    // Fetch and Node's HTTP parser normalize optional surrounding whitespace,
    // while the parser unit test covers direct whitespace rejection.
    for (const value of ["BOY", "Girl", "partner", "boy,girl"]) {
      const response = await bootstrap.request<ApiError>(
        "/identity/me",
        { headers: { "x-our-tomorrow-role": value } },
        { role: null },
      );
      expect(response).toMatchObject({
        status: 400,
        body: { code: "IDENTITY_REQUIRED" },
      });
    }

    const valid = await bootstrap.request<IdentitySession>(
      "/identity/me",
      { headers: { "x-our-tomorrow-role": "girl" } },
      { role: null },
    );
    expect(valid).toMatchObject({
      status: 200,
      body: { user: { role: "girl" } },
    });
  });

  test("structured logs and high-impact audits exclude search terms and bodies", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const bootstrap = new Stage1HttpClient(running.baseUrl);
    const identity = await selectIdentity(bootstrap, "boy");
    const boy = new Stage1HttpClient(running.baseUrl, "boy");
    const girl = new Stage1HttpClient(running.baseUrl, "girl");
    const searchSecret = "stage5a-private-search-sentinel";
    const noteSecret = "stage5a-note-body-must-never-be-audited";
    const wishSecret = "stage5a-wish-body-must-never-be-audited";
    const capsuleSecret = "stage5a-capsule-body-must-never-be-audited";

    expect(
      (await boy.get(`/memories?query=${encodeURIComponent(searchSecret)}`))
        .status,
    ).toBe(200);

    const note = await boy.post<VersionedResource>("/notes", {
      type: "DO_TOGETHER",
      content: noteSecret,
    });
    expect(note.status).toBe(201);
    expect(
      (
        await postWithContext(
          boy,
          `/notes/${note.body!.id}/convert`,
          { targetType: "WISH", category: "LIFE" },
          "request-stage5a-note-convert",
          "stage5a-note-convert",
        )
      ).status,
    ).toBe(201);

    const wish = await boy.post<VersionedResource>("/wishes", {
      title: "阶段 5A 愿望",
      description: wishSecret,
    });
    const planned = await boy.post<VersionedResource>(
      `/wishes/${wish.body!.id}/plan`,
      {
        version: wish.body!.version,
        startsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    );
    const started = await boy.post<VersionedResource>(
      `/wishes/${wish.body!.id}/start`,
      { version: planned.body!.version },
    );
    const completed = await boy.post<VersionedResource>(
      `/wishes/${wish.body!.id}/complete`,
      { version: started.body!.version, completionNote: wishSecret },
    );
    expect(
      (
        await postWithContext(
          boy,
          `/wishes/${wish.body!.id}/convert-to-memory`,
          { version: completed.body!.version },
          "request-stage5a-wish-convert",
          "stage5a-wish-convert",
        )
      ).status,
    ).toBe(201);

    const capsule = await boy.post<VersionedResource>("/capsules", {
      title: "阶段 5A 胶囊",
      type: "TO_BOTH",
      unlockRule: "AT_TIME",
      unlockAt: new Date(Date.now() - 60_000).toISOString(),
      message: capsuleSecret,
    });
    const sealed = await postWithContext<VersionedResource>(
      boy,
      `/capsules/${capsule.body!.id}/seal`,
      { version: capsule.body!.version },
      "request-stage5a-capsule-seal",
    );
    const boyOpened = await postWithContext<VersionedResource>(
      boy,
      `/capsules/${capsule.body!.id}/open`,
      { version: sealed.body!.version },
      "request-stage5a-capsule-open-boy",
    );
    const girlOpened = await postWithContext<VersionedResource>(
      girl,
      `/capsules/${capsule.body!.id}/open`,
      { version: boyOpened.body!.version },
      "request-stage5a-capsule-open-girl",
    );
    expect(
      (
        await postWithContext(
          boy,
          `/capsules/${capsule.body!.id}/convert-to-memory`,
          { version: girlOpened.body!.version },
          "request-stage5a-capsule-convert",
          "stage5a-capsule-convert",
        )
      ).status,
    ).toBe(201);

    const audits = await prisma.auditLog.findMany({
      where: { coupleId: identity.couple.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        action: true,
        resourceId: true,
        requestId: true,
        metadata: true,
      },
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "NOTE_CONVERTED_TO_WISH",
      "WISH_CONVERTED_TO_MEMORY",
      "CAPSULE_SEALED",
      "CAPSULE_OPENED",
      "CAPSULE_OPENED",
      "CAPSULE_CONVERTED_TO_MEMORY",
    ]);
    expect(audits.map(({ requestId }) => requestId)).toEqual([
      "request-stage5a-note-convert",
      "request-stage5a-wish-convert",
      "request-stage5a-capsule-seal",
      "request-stage5a-capsule-open-boy",
      "request-stage5a-capsule-open-girl",
      "request-stage5a-capsule-convert",
    ]);
    for (const audit of audits) {
      expect(Object.keys(audit.metadata as object).sort()).toEqual([
        "resourceId",
        "status",
        "version",
      ]);
      expect((audit.metadata as { resourceId: string }).resourceId).toBe(
        audit.resourceId,
      );
    }

    const auditJson = JSON.stringify(audits);
    for (const secret of [
      searchSecret,
      noteSecret,
      wishSecret,
      capsuleSecret,
    ]) {
      expect(auditJson).not.toContain(secret);
    }

    const requestLogs = log.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes('"route"'))
      .map(
        (message) =>
          JSON.parse(message) as {
            requestId: string;
            method: string;
            route: string;
            status: number;
            durationMs: number;
          },
      );
    expect(requestLogs.length).toBeGreaterThan(0);
    for (const requestLog of requestLogs) {
      expect(Object.keys(requestLog).sort()).toEqual([
        "durationMs",
        "method",
        "requestId",
        "route",
        "status",
      ]);
      expect(requestLog.route).not.toContain("?");
      expect(requestLog.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(requestLogs.map(({ requestId }) => requestId)).toEqual(
      expect.arrayContaining([
        "request-stage5a-note-convert",
        "request-stage5a-wish-convert",
        "request-stage5a-capsule-seal",
        "request-stage5a-capsule-open-boy",
        "request-stage5a-capsule-open-girl",
        "request-stage5a-capsule-convert",
      ]),
    );
    const requestLogJson = JSON.stringify(requestLogs);
    expect(requestLogJson).not.toContain(note.body!.id);
    expect(requestLogJson).not.toContain(wish.body!.id);
    expect(requestLogJson).not.toContain(capsule.body!.id);
    expect(requestLogJson).not.toContain(searchSecret);
    expect(requestLogJson).not.toContain(noteSecret);
    expect(requestLogJson).not.toContain(wishSecret);
    expect(requestLogJson).not.toContain(capsuleSecret);
  });
});
