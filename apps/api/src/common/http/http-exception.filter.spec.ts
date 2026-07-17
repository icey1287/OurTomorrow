import { Logger, type ArgumentsHost } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpExceptionFilter } from "./http-exception.filter";

afterEach(() => vi.restoreAllMocks());

describe("HttpExceptionFilter", () => {
  it("logs only a route template and error type for unexpected failures", () => {
    const secret = "private-search-and-diary-sentinel";
    const resourceId = "11111111-1111-4111-8111-111111111111";
    const request = {
      method: "GET",
      originalUrl: `/api/v1/memories/${resourceId}?query=${secret}`,
      requestId: "request-stage5-filter",
      route: { path: "/api/v1/memories/:id" },
    };
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const log = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});

    new HttpExceptionFilter().catch(new Error(secret), host);

    expect(log).toHaveBeenCalledTimes(1);
    const logged = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toEqual({
      requestId: "request-stage5-filter",
      method: "GET",
      route: "/api/v1/memories/:id",
      status: 500,
      errorType: "Error",
    });
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(resourceId);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "INTERNAL_ERROR",
        path: "/api/v1/memories/:id",
      }),
    );
  });
});
