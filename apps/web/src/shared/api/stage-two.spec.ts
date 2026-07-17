import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { normalizeStageTwoApiPath, stageTwoApi } from "@/shared/api/stage-two";

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("stage two API", () => {
  it("serializes only active memory filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ items: [], meta: { nextCursor: null, hasMore: false } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageTwoApi.memories({
      year: 2024,
      month: null,
      firstTime: false,
      perspectiveState: "incomplete",
      query: " 看海 ",
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/memories?");
    const parsed = new URL(url, "https://example.test");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      year: "2024",
      firstTime: "false",
      perspectiveState: "incomplete",
      query: " 看海 ",
    });
  });

  it("sends memory version in the body and If-Match header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "m-1", version: 8 }));
    vi.stubGlobal("fetch", fetchMock);

    await stageTwoApi.updateMemory("m-1", {
      version: 7,
      title: "新的标题",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("If-Match")).toBe('"memory:m-1:7"');
    expect(JSON.parse(String(init.body))).toEqual({
      version: 7,
      title: "新的标题",
    });
  });

  it("uses static first-time and blind-box routes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ items: [], meta: { nextCursor: null, hasMore: false } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [], meta: { nextCursor: null, hasMore: false } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          serverNow: "2026-07-16T08:30:00.000Z",
          localDate: "2026-07-16",
          box: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: "box-1", memory: { id: "memory-1" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "box-1", memory: null }));
    vi.stubGlobal("fetch", fetchMock);

    await stageTwoApi.firstTimes({ limit: 12, cursor: "next page" });
    await stageTwoApi.memoryResurfaceToday();
    await stageTwoApi.openMemoryResurface("box-1");
    await stageTwoApi.dismissMemoryResurface("box-1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/memories/first-times?limit=12&cursor=next+page",
      "/api/v1/memory-resurfaces/today",
      "/api/v1/memory-resurfaces/box-1/open",
      "/api/v1/memory-resurfaces/box-1/dismiss",
    ]);
    expect(
      fetchMock.mock.calls.slice(2).map(([, init]) => init.method),
    ).toEqual(["POST", "POST"]);
  });

  it("normalizes same-origin upload and media paths", () => {
    expect(normalizeStageTwoApiPath("/api/v1/uploads/u-1/content")).toBe(
      "/uploads/u-1/content",
    );
    expect(
      normalizeStageTwoApiPath(
        "https://our-tomorrow.test/api/v1/media/m-1/thumbnail",
      ),
    ).toBe("/media/m-1/thumbnail");
    expect(normalizeStageTwoApiPath("media/m-1")).toBe("/media/m-1");
  });

  it("uploads raw bytes to the one-time path with the selected identity", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    const blob = new Blob(["image"], { type: "image/webp" });
    await stageTwoApi.uploadBinary(
      "/api/v1/uploads/u-1/content",
      blob,
      "image/webp",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/uploads/u-1/content");
    expect(init.body).toBe(blob);
    expect(new Headers(init.headers).get("Content-Type")).toBe("image/webp");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("girl");
  });

  it("reuses one idempotency key when completing the same upload", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ id: "media-1" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageTwoApi.completeUpload("upload-stable-key");
    await stageTwoApi.completeUpload("upload-stable-key");

    const firstHeaders = new Headers(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    );
    const secondHeaders = new Headers(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].headers,
    );
    expect(firstHeaders.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(secondHeaders.get("Idempotency-Key")).toBe(
      firstHeaders.get("Idempotency-Key"),
    );
  });
});
