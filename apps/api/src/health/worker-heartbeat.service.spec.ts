import { promises as fileSystem } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fileSystem.rm(root, { recursive: true, force: true })),
  );
});

describe("WorkerHeartbeatService", () => {
  it("writes an atomic running marker and a stopped marker on shutdown", async () => {
    const root = await fileSystem.mkdtemp(
      path.join(os.tmpdir(), "our-tomorrow-worker-health-"),
    );
    roots.push(root);
    const heartbeatPath = path.join(root, ".ops", "worker-heartbeat.json");
    const clock = {
      now: () => new Date("2026-07-17T08:00:00.000Z"),
    } as Clock;
    const config = {
      get(key: keyof Environment) {
        if (key === "WORKER_HEARTBEAT_PATH") return heartbeatPath;
        if (key === "WORKER_HEARTBEAT_INTERVAL_MS") return 60_000;
        throw new Error(`Unexpected config key ${key}`);
      },
    } as unknown as ConfigService<Environment, true>;
    const service = new WorkerHeartbeatService(clock, config);

    await service.onApplicationBootstrap();
    expect(
      JSON.parse(await fileSystem.readFile(heartbeatPath, "utf8")),
    ).toMatchObject({
      version: 1,
      state: "RUNNING",
      updatedAt: "2026-07-17T08:00:00.000Z",
    });

    await service.onApplicationShutdown();
    expect(
      JSON.parse(await fileSystem.readFile(heartbeatPath, "utf8")),
    ).toMatchObject({ state: "STOPPED" });
  });
});
