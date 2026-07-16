import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiClient,
  ApiClientError,
  apiFieldErrors,
  setApiIdentityRole,
} from "@/shared/api/client";
import { stageOneApi } from "@/shared/api/stage-one";

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

describe("api client", () => {
  it("adds the selected role to every identity-scoped request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await apiClient.patch("/users/me", { displayName: "甲" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/users/me");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
  });

  it("can call the public identity selector without a stale role header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await stageOneApi.selectIdentity({ role: "girl" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("X-Our-Tomorrow-Role")).toBe(false);
  });

  it("normalizes API field details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 400,
            code: "VALIDATION_FAILED",
            message: "Request validation failed",
            requestId: "req-1",
            timestamp: new Date(0).toISOString(),
            path: "/api/v1/users/me",
            details: { displayName: ["must not be empty", "too long"] },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const error = await apiClient
      .patch("/users/me", {})
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(apiFieldErrors(error as ApiClientError)).toEqual({
      displayName: "must not be empty；too long",
    });
  });
});
