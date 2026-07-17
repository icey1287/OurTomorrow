import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageThreeApi } from "@/shared/api/stage-three";

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

describe("stage three API", () => {
  it("sends selected identity and absolute expiry when setting a status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: "status-1", version: 2, kind: "BUSY" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await stageThreeApi.setStatus({
      kind: "BUSY",
      message: "先忙一会儿",
      expiresAt: "2026-07-17T08:30:00.000Z",
      version: 1,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/statuses/me");
    expect(init.method).toBe("PUT");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("girl");
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "BUSY",
      message: "先忙一会儿",
      expiresAt: "2026-07-17T08:30:00.000Z",
      version: 1,
    });
  });

  it("keeps scheduled note instants in the request body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: "note-1", version: 1, status: "SCHEDULED" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageThreeApi.createNote({
      type: "SURPRISE",
      content: "周末见",
      showAt: "2026-07-18T02:00:00.000Z",
      expiresAt: "2026-07-19T02:00:00.000Z",
      publish: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/notes");
    expect(JSON.parse(String(init.body))).toMatchObject({
      type: "SURPRISE",
      showAt: "2026-07-18T02:00:00.000Z",
      expiresAt: "2026-07-19T02:00:00.000Z",
      publish: true,
    });
  });

  it("uses optimistic versions for note edit and view transitions", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ id: "note-1", version: 5 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageThreeApi.updateNote("note-1", {
      version: 4,
      content: "修改后的内容",
    });
    await stageThreeApi.markNoteViewed("note-1", 5);

    const editInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(new Headers(editInit.headers).get("If-Match")).toBe(
      '"note:note-1:4"',
    );
    expect(JSON.parse(String(editInit.body))).toEqual({
      version: 4,
      content: "修改后的内容",
    });

    const [viewUrl, viewInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(viewUrl).toBe("/api/v1/notes/note-1/mark-viewed");
    expect(viewInit.method).toBe("POST");
    expect(JSON.parse(String(viewInit.body))).toEqual({ version: 5 });
  });

  it("serializes note scope and archive flags without client-side filtering", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ serverNow: "now", items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await stageThreeApi.notes("received", true);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/api/v1/notes");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      scope: "received",
      includeArchived: "true",
    });
  });

  it("sends the diary version through save, submit, and postscript states", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          date: "2026-07-17",
          status: "EDITING",
          mine: { version: 3 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stageThreeApi.saveDailyEntry({ answer: "今天想起你了", version: 2 });
    await stageThreeApi.submitDailyEntry({ version: 3 });
    await stageThreeApi.updateDailyEntryPostscript({
      version: 4,
      postscript: "揭晓后还想再说一句",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toEqual({
      answer: "今天想起你了",
      version: 2,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      version: 3,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1].body))).toEqual({
      version: 4,
      postscript: "揭晓后还想再说一句",
    });
  });
});
