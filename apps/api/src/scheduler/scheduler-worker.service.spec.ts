import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import type { PrismaService } from "../database/prisma.service";
import { SchedulerWorkerService } from "./scheduler-worker.service";

describe("SchedulerWorkerService", () => {
  it("uses the injected server clock when selecting due persistent events", async () => {
    const now = new Date("2026-07-16T08:30:00.000Z");
    const count = vi.fn(async () => 0);
    const config = { get: vi.fn(() => 2_000) } as unknown as ConfigService<
      Environment,
      true
    >;
    const prisma = { scheduledEvent: { count } } as unknown as PrismaService;
    const clock = {
      now: vi.fn(() => now),
      localDate: vi.fn(),
    } as unknown as Clock;
    const worker = new SchedulerWorkerService(config, prisma, clock);

    await worker.poll();

    expect(count).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        runAt: { lte: now },
      },
    });
    expect(clock.now).toHaveBeenCalledOnce();
  });

  it("keeps its polling timer referenced so the worker process stays alive", () => {
    vi.useFakeTimers();
    const config = { get: vi.fn(() => 2_000) } as unknown as ConfigService<
      Environment,
      true
    >;
    const prisma = {
      scheduledEvent: { count: vi.fn(async () => 0) },
    } as unknown as PrismaService;
    const clock = {
      now: vi.fn(() => new Date("2026-07-16T08:30:00.000Z")),
      localDate: vi.fn(),
    } as unknown as Clock;
    const worker = new SchedulerWorkerService(config, prisma, clock);

    worker.start();
    const timer = (worker as unknown as { timer?: NodeJS.Timeout }).timer;

    expect(timer?.hasRef()).toBe(true);
    worker.onApplicationShutdown();
    vi.useRealTimers();
  });
});
