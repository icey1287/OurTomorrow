import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const sharp = require("sharp");

const [mode, rawBaseUrl, statePath, resultPath] = process.argv.slice(2);
const baseUrl = rawBaseUrl?.replace(/\/$/, "");

if (!["seed", "assert"].includes(mode) || !baseUrl || !statePath) {
  throw new Error(
    "usage: node restore-drill-fixture.mjs seed|assert BASE_URL STATE_PATH [RESULT_PATH]",
  );
}

async function request(
  path,
  { role, method = "GET", body, headers = {} } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(role ? { "X-Our-Tomorrow-Role": role } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const parsed = contentType.includes("application/json")
    ? await response.json()
    : await response.arrayBuffer();
  return { response, body: parsed };
}

function expectStatus(result, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(result.response.status)) {
    throw new Error(`${label} returned HTTP ${result.response.status}`);
  }
}

async function select(role) {
  const result = await request("/api/v1/identity/select", {
    method: "POST",
    body: { role },
  });
  expectStatus(result, 200, `select ${role}`);
  return result.body;
}

async function upload(role, source, originalName) {
  const intent = await request("/api/v1/uploads/presign", {
    role,
    method: "POST",
    body: {
      originalName,
      mimeType: "image/png",
      size: source.byteLength,
    },
  });
  expectStatus(intent, 201, `presign ${originalName}`);

  const accepted = await fetch(`${baseUrl}${intent.body.uploadUrl}`, {
    method: "PUT",
    headers: {
      "X-Our-Tomorrow-Role": role,
      "Content-Type": "image/png",
      "Content-Length": String(source.byteLength),
    },
    body: source,
  });
  if (accepted.status !== 204) {
    throw new Error(`upload ${originalName} returned HTTP ${accepted.status}`);
  }

  const completed = await request("/api/v1/uploads/complete", {
    role,
    method: "POST",
    headers: { "Idempotency-Key": `restore-drill-${intent.body.uploadId}` },
    body: { uploadId: intent.body.uploadId },
  });
  expectStatus(completed, 200, `complete ${originalName}`);
  return completed.body;
}

async function decodePrivate(path, role, label) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "X-Our-Tomorrow-Role": role },
  });
  if (response.status !== 200) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const metadata = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  if (metadata.format !== "webp" || !metadata.width || !metadata.height) {
    throw new Error(`${label} was not a decodable processed WebP`);
  }
  return metadata;
}

async function expectHidden(path, role, label) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "X-Our-Tomorrow-Role": role },
  });
  if (response.status !== 404) {
    throw new Error(`${label} leaked with HTTP ${response.status}`);
  }
}

async function seed() {
  const boy = await select("boy");
  const girl = await select("girl");
  if (boy.couple.id !== girl.couple.id || boy.user.id === girl.user.id) {
    throw new Error("fixture identities do not share exactly one Couple");
  }

  const visibleSource = await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 3,
      background: { r: 218, g: 112, b: 82 },
    },
  })
    .png()
    .toBuffer();
  const secretSource = await sharp({
    create: {
      width: 7,
      height: 5,
      channels: 3,
      background: { r: 82, g: 104, b: 168 },
    },
  })
    .png()
    .toBuffer();

  const visibleMedia = await upload(
    "boy",
    visibleSource,
    "restore-visible.png",
  );
  const secretMedia = await upload("boy", secretSource, "restore-secret.png");

  const memory = await request("/api/v1/memories", {
    role: "boy",
    method: "POST",
    body: {
      title: "恢复演练公开回忆",
      content: "这条夹具用于验证数据库与私有媒体共同恢复。",
      happenedAt: "2026-07-17T06:00:00.000Z",
      mediaIds: [visibleMedia.id],
      coverMediaId: visibleMedia.id,
    },
  });
  expectStatus(memory, 201, "create fixture memory");

  const secret = "RESTORE_DRILL_LOCKED_BODY_7f604cb0";
  const capsule = await request("/api/v1/capsules", {
    role: "boy",
    method: "POST",
    body: {
      title: "恢复演练锁定胶囊",
      type: "TO_BOTH",
      unlockRule: "AT_TIME",
      unlockAt: "2036-07-17T06:00:00.000Z",
      requiresBothConfirmation: true,
      message: secret,
      mediaIds: [secretMedia.id],
    },
  });
  expectStatus(capsule, [200, 201], "create fixture capsule");

  const sealed = await request(`/api/v1/capsules/${capsule.body.id}/seal`, {
    role: "boy",
    method: "POST",
    body: { version: capsule.body.version },
  });
  expectStatus(sealed, [200, 201], "seal fixture capsule");
  if (sealed.body.status !== "LOCKED") {
    throw new Error("fixture capsule did not enter LOCKED state");
  }

  const state = {
    boyUserId: boy.user.id,
    girlUserId: girl.user.id,
    coupleId: boy.couple.id,
    memoryId: memory.body.id,
    visibleMedia,
    capsuleId: capsule.body.id,
    secretMedia,
    secret,
  };
  writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  chmodSync(statePath, 0o600);
  process.stdout.write("restore fixture seeded\n");
}

async function assertRestored() {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const boy = await select("boy");
  const girl = await select("girl");

  if (
    boy.user.id !== state.boyUserId ||
    girl.user.id !== state.girlUserId ||
    boy.couple.id !== state.coupleId ||
    girl.couple.id !== state.coupleId
  ) {
    throw new Error(
      "restored fixed identities/Couple differ from the source snapshot",
    );
  }

  const memory = await request(`/api/v1/memories/${state.memoryId}`, {
    role: "girl",
  });
  expectStatus(memory, 200, "read restored memory");
  if (memory.body.coverMedia?.id !== state.visibleMedia.id) {
    throw new Error("restored memory lost its private media relation");
  }

  await decodePrivate(state.visibleMedia.url, "boy", "boy restored original");
  await decodePrivate(state.visibleMedia.url, "girl", "girl restored original");
  await decodePrivate(
    state.visibleMedia.thumbnailUrl,
    "girl",
    "girl restored thumbnail",
  );

  for (const role of ["boy", "girl"]) {
    const hidden = await request(`/api/v1/capsules/${state.capsuleId}`, {
      role,
    });
    expectStatus(hidden, 200, `${role} locked capsule`);
    const serialized = JSON.stringify(hidden.body);
    if (
      hidden.body.bodyAvailable !== false ||
      serialized.includes(state.secret) ||
      serialized.includes(state.secretMedia.id) ||
      serialized.includes(state.secretMedia.originalName)
    ) {
      throw new Error(`${role} received locked capsule body/media metadata`);
    }
    await expectHidden(state.secretMedia.url, role, `${role} locked original`);
    await expectHidden(
      state.secretMedia.thumbnailUrl,
      role,
      `${role} locked thumbnail`,
    );
  }

  const laundering = await request("/api/v1/memories", {
    role: "girl",
    method: "POST",
    body: {
      title: "恢复后附件权限回归检查",
      happenedAt: "2026-07-17T06:30:00.000Z",
      mediaIds: [state.secretMedia.id],
      coverMediaId: state.secretMedia.id,
    },
  });
  expectStatus(laundering, 404, "locked media laundering attempt");

  const result = {
    format: "our-tomorrow-restore-fixture-assertions",
    version: 1,
    status: "succeeded",
    checks: {
      fixedIdentitiesPreserved: true,
      sharedCouplePreserved: true,
      memoryRelationPreserved: true,
      visibleOriginalDecodedForBothRoles: true,
      visibleThumbnailDecoded: true,
      lockedCapsuleBodyHiddenForBothRoles: true,
      lockedMediaDeniedForBothRoles: true,
      lockedMediaCannotBeRebound: true,
    },
  };
  if (resultPath) {
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(resultPath, 0o600);
  }
  process.stdout.write("restored fixture privacy/media assertions passed\n");
}

if (mode === "seed") await seed();
else await assertRestored();
