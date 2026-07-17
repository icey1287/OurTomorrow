import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageFourApi } from "@/shared/api/stage-four";

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

describe("stage four API", () => {
  it("serializes wish filters and includes the selected role", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ items: [], meta: { nextCursor: null, hasMore: false } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await stageFourApi.wishes({
      limit: 12,
      status: "IN_PROGRESS",
      category: "TRAVEL",
      placeId: "11111111-1111-4111-8111-111111111111",
      query: "极光",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, "https://example.test");
    expect(parsed.pathname).toBe("/api/v1/wishes");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      limit: "12",
      status: "IN_PROGRESS",
      category: "TRAVEL",
      placeId: "11111111-1111-4111-8111-111111111111",
      query: "极光",
    });
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("girl");
  });

  it("uses explicit command endpoints and optimistic versions", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ id: "wish-1", version: 8, status: "IN_PROGRESS" }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageFourApi.startWish("wish-1", { version: 7 });
    await stageFourApi.completePlan("plan-1", { version: 3 });
    await stageFourApi.markCapsuleConditionMet("capsule-1", { version: 4 });
    await stageFourApi.confirmCapsuleOpen("capsule-1", { version: 5 });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/v1/wishes/wish-1/start",
      "/api/v1/plans/plan-1/complete",
      "/api/v1/capsules/capsule-1/mark-condition-met",
      "/api/v1/capsules/capsule-1/confirm-open",
    ]);
    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body))),
    ).toEqual([{ version: 7 }, { version: 3 }, { version: 4 }, { version: 5 }]);
  });

  it("sends a stable caller-provided idempotency key when converting", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ id: "memory-1", version: 1, title: "极光" }, 201),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await stageFourApi.convertWishToMemory(
      "wish-1",
      {
        version: 6,
        title: "终于一起看了极光",
        happenedAt: "2027-02-11T19:00:00.000Z",
      },
      "wish-to-memory:request-1",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/wishes/wish-1/convert-to-memory");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "wish-to-memory:request-1",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      version: 6,
      happenedAt: "2027-02-11T19:00:00.000Z",
    });

    await stageFourApi.convertNote(
      "note-1",
      { targetType: "WISH", category: "FOOD" },
      "note-to-wish:request-1",
    );
    const [noteUrl, noteInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(noteUrl).toBe("/api/v1/notes/note-1/convert");
    expect(new Headers(noteInit.headers).get("Idempotency-Key")).toBe(
      "note-to-wish:request-1",
    );
  });

  it("keeps anniversary local dates and reminder wall-clock minutes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "anniversary-1", version: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: "reminder-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await stageFourApi.createAnniversary({
      title: "初见",
      type: "FIRST_MEETING",
      date: "2024-01-01",
      repeat: "YEARLY",
    });
    await stageFourApi.createAnniversaryReminder("anniversary-1", {
      daysBefore: 7,
      minuteOfDay: 570,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1].body))).toMatchObject(
      {
        date: "2024-01-01",
        repeat: "YEARLY",
      },
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/v1/anniversaries/anniversary-1/reminders",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      daysBefore: 7,
      minuteOfDay: 570,
    });
  });

  it("passes versions in delete queries instead of hiding local state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await stageFourApi.deleteWish("wish-1", 4);
    await stageFourApi.deletePlan("plan-1", 2);
    await stageFourApi.deleteCapsule("capsule-1", 9);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/v1/wishes/wish-1?version=4",
      "/api/v1/plans/plan-1?version=2",
      "/api/v1/capsules/capsule-1?version=9",
    ]);
  });
});
