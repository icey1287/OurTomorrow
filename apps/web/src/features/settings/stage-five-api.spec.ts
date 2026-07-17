import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageFiveApi } from "@/shared/api/stage-five";

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

describe("stage five API", () => {
  it("reads non-sensitive data status with the selected role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          serverNow: "2026-07-17T08:00:00.000Z",
          backup: { status: "UNKNOWN", lastSuccessAt: null },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await stageFiveApi.dataStatus();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/settings/data-status");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
  });

  it("creates a confirmed export with a caller-owned idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "export-1",
          status: "READY",
          format: "ZIP",
          downloadAvailable: true,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await stageFiveApi.createExport("ZIP", "export-request-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/exports");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("girl");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "export-request-1",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      confirmed: true,
      format: "ZIP",
    });
  });

  it("downloads the private package with POST and the current role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(["private-export"], { type: "application/zip" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await expect(
      stageFiveApi.downloadExport("export-1"),
    ).resolves.toBeInstanceOf(Blob);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/exports/export-1/download");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
    expect(init.credentials).toBe("omit");
  });

  it("accepts an empty 202 response for delayed recycle-bin purging", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await expect(
      stageFiveApi.requestRecycleBinPurge("item-1"),
    ).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/recycle-bin/item-1");
    expect(init.method).toBe("DELETE");
  });
});
