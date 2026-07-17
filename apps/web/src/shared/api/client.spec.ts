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

  it("uploads binary media without rewriting its content type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await apiClient.putBinary(
      "/uploads/media-1/content",
      new Blob(["image"], { type: "image/png" }),
      "image/png",
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("image/png");
    expect(headers.get("X-Our-Tomorrow-Role")).toBe("girl");
  });

  it("fetches private media blobs with the selected role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["private-image"], { type: "image/webp" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await expect(apiClient.blob("/media/media-1")).resolves.toBeInstanceOf(
      Blob,
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
  });
});
