import type { ConfigService } from "@nestjs/config";
import { HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import type { PrismaService } from "../database/prisma.service";
import { HealthController } from "./health.controller";

const instant = new Date("2026-07-16T08:00:00.000Z");

function createController(databaseReady: boolean) {
  const config = {
    get: vi.fn((key: keyof Environment) =>
      key === "APP_VERSION" ? "1.2.3" : undefined,
    ),
  } as unknown as ConfigService<Environment, true>;
  const clock = {
    now: vi.fn(() => instant),
    localDate: vi.fn(),
  } as unknown as Clock;
  const prisma = {
    isReady: vi.fn(async () => databaseReady),
  } as unknown as PrismaService;
  return new HealthController(config, clock, prisma);
}

function createResponse() {
  return {
    status: vi.fn(),
  } as unknown as Response;
}

describe("HealthController", () => {
  it("reports process liveness without querying the database", () => {
    expect(createController(false).live()).toEqual({
      status: "ok",
      version: "1.2.3",
      timestamp: instant.toISOString(),
    });
  });

  it("returns HTTP 200 when the database is ready", async () => {
    const response = createResponse();

    await expect(createController(true).ready(response)).resolves.toEqual({
      status: "ok",
      version: "1.2.3",
      timestamp: instant.toISOString(),
      database: "up",
    });
    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it("returns HTTP 503 and an error body when the database is unavailable", async () => {
    const response = createResponse();

    await expect(createController(false).ready(response)).resolves.toEqual({
      status: "error",
      version: "1.2.3",
      timestamp: instant.toISOString(),
      database: "down",
    });
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
