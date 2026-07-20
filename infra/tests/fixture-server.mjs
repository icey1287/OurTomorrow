import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const boy = {
  id: "00000000-0000-4000-8000-000000000101",
  version: 1,
  displayName: "甲",
  role: "boy",
  slot: 1,
  nicknameInRelationship: "甲",
  avatarUrl: null,
};
const girl = {
  id: "00000000-0000-4000-8000-000000000102",
  version: 1,
  displayName: "乙",
  role: "girl",
  slot: 2,
  nicknameInRelationship: "乙",
  avatarUrl: null,
};
const couple = {
  id: "00000000-0000-4000-8000-000000000001",
  version: 1,
  name: "我们的明天",
  startDate: "2024-01-01",
  timezone: "Asia/Shanghai",
  signature: "今天也一起认真生活。",
  theme: "system",
  members: [boy, girl],
};

function securityHeaders() {
  return {
    "Content-Security-Policy":
      "default-src 'self'; frame-ancestors 'none'; object-src 'none'",
    "Permissions-Policy": "camera=(), geolocation=(self), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function json(response, status, value) {
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
  });
  response.end(JSON.stringify(value));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {
      ...securityHeaders(),
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end("<!doctype html><title>OurTomorrow smoke fixture</title>");
    return;
  }

  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, securityHeaders());
    response.end("ok\n");
    return;
  }

  if (
    request.method === "GET" &&
    (request.url === "/api/v1/health/live" ||
      request.url === "/api/v1/health/ready")
  ) {
    json(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "POST" && request.url === "/api/v1/identity/select") {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const role = JSON.parse(raw).role;
      const user = role === "boy" ? boy : girl;
      json(response, 200, { role, user, couple });
    });
    return;
  }

  if (request.method === "GET" && request.url === "/api/v1/couples/current") {
    json(response, 200, couple);
    return;
  }

  json(response, 404, { code: "NOT_FOUND" });
});

server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  if (process.env.PORT_FILE)
    writeFileSync(process.env.PORT_FILE, `${address.port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
