import { Logger } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredRequestLogMiddleware } from "./structured-request-log.middleware";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StructuredRequestLogMiddleware", () => {
  it("logs only the request id, method, route template, status and duration", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const response = new EventEmitter() as EventEmitter & Response;
    response.statusCode = 200;
    const request = {
      requestId: "request-stage5a-0001",
      method: "GET",
      route: { path: "/api/v1/memories" },
      originalUrl: "/api/v1/memories?query=绝不能进入日志的搜索词",
      query: { query: "绝不能进入日志的搜索词" },
      body: { content: "绝不能进入日志的正文" },
    } as unknown as Request;

    new StructuredRequestLogMiddleware().use(request, response, (() =>
      response.emit("finish")) as NextFunction);

    expect(log).toHaveBeenCalledOnce();
    const serialized = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toEqual({
      requestId: "request-stage5a-0001",
      method: "GET",
      route: "/api/v1/memories",
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(serialized).not.toContain("绝不能进入日志的搜索词");
    expect(serialized).not.toContain("绝不能进入日志的正文");
    expect(serialized).not.toContain("originalUrl");
    expect(serialized).not.toContain("query");
    expect(serialized).not.toContain("body");
  });

  it("uses a constant unmatched route instead of logging an unknown URL", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const response = new EventEmitter() as EventEmitter & Response;
    response.statusCode = 404;
    const request = {
      requestId: "request-stage5a-0002",
      method: "GET",
      originalUrl: "/private-path?query=仍然不能泄露",
    } as unknown as Request;

    new StructuredRequestLogMiddleware().use(request, response, (() =>
      response.emit("finish")) as NextFunction);

    const serialized = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toMatchObject({ route: "<unmatched>" });
    expect(serialized).not.toContain("private-path");
    expect(serialized).not.toContain("仍然不能泄露");
  });
});
