"use strict";

const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { join } = require("node:path");

const REQUIRED_OPERATIONS = {
  "/api/v1/identity/select": ["post"],
  "/api/v1/couples/current": ["patch"],
  "/api/v1/statuses/current": ["get"],
  "/api/v1/statuses/me": ["put", "delete"],
  "/api/v1/notes": ["get", "post"],
  "/api/v1/notes/{id}/image": ["get"],
  "/api/v1/notes/{id}/mark-viewed": ["post"],
  "/api/v1/places/nearby": ["post"],
  "/api/v1/places/status/{id}/map-preview": ["get"],
  "/api/v1/health/live": ["get"],
  "/api/v1/health/ready": ["get"],
};

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve an IPv4 smoke-test port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-20_000);
}

function childOutput(stdout, stderr) {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
}

function assertOpenApi(document) {
  if (typeof document?.openapi !== "string") {
    throw new Error("OpenAPI endpoint did not return an OpenAPI document");
  }

  let operationCount = 0;
  for (const [path, methods] of Object.entries(REQUIRED_OPERATIONS)) {
    for (const method of methods) {
      operationCount += 1;
      if (!document.paths?.[path]?.[method]) {
        throw new Error(`OpenAPI is missing ${method.toUpperCase()} ${path}`);
      }
    }
  }

  if (!document.components?.securitySchemes?.["local-role"]) {
    throw new Error("OpenAPI is missing the local-role header scheme");
  }

  return operationCount;
}

async function main() {
  const port = await reservePort();
  const apiDirectory = join(__dirname, "..");
  const child = spawn(process.execPath, [join(apiDirectory, "dist/main.js")], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      API_PORT: String(port),
      DATABASE_URL:
        "postgresql://openapi_smoke:openapi_smoke@127.0.0.1:1/openapi_smoke?schema=public&connect_timeout=1&pool_timeout=1",
      WEB_ORIGIN: "http://127.0.0.1:5173",
      TRUST_PROXY: "false",
      TZ: "Asia/Shanghai",
      APP_VERSION: "openapi-smoke",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = appendBounded(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = appendBounded(stderr, chunk);
  });

  const exited = new Promise((resolve) => child.once("exit", resolve));
  const endpoint = `http://127.0.0.1:${port}/api/v1/openapi.json`;

  try {
    const deadline = Date.now() + 10_000;
    let document;
    let lastError;

    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `API exited before OpenAPI became available\n${childOutput(stdout, stderr)}`,
        );
      }

      try {
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(1_000),
        });
        if (response.ok) {
          document = await response.json();
          break;
        }
        lastError = new Error(`OpenAPI returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await wait(100);
    }

    if (!document) {
      throw new Error(
        `OpenAPI did not become available: ${String(lastError)}\n${childOutput(stdout, stderr)}`,
      );
    }

    const operationCount = assertOpenApi(document);
    process.stdout.write(
      `OpenAPI smoke passed: API started and exposed ${operationCount} required operations.\n`,
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([exited, wait(2_000)]);
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await exited;
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
