import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageSixApi } from "@/shared/api/stage-six";

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

describe("stage six daily API", () => {
  it("sends a touch kind without declaring a recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "touch-1",
        kind: "HUG",
        direction: "SENT",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await stageSixApi.sendTouch({ kind: "HUG" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/touch-events");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
    expect(JSON.parse(String(init.body))).toEqual({ kind: "HUG" });
    expect(String(init.body)).not.toContain("recipient");
  });

  it("keeps calm-letter content in POST bodies and out of list URLs", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          id: "letter-1",
          version: 1,
          status: "LOCKED",
          bodyAvailable: true,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stageSixApi.calmLetters();
    await stageSixApi.createCalmLetter({
      purpose: "DISCUSS_LATER",
      content: "等我们都平静一点再聊。",
      unlockAt: "2026-07-17T10:30:00.000Z",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/calm-letters");
    expect(fetchMock.mock.calls[0]?.[1].method).toBe("GET");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("等我们");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1].body))).toEqual({
      purpose: "DISCUSS_LATER",
      content: "等我们都平静一点再聊。",
      unlockAt: "2026-07-17T10:30:00.000Z",
    });
  });

  it("uses an optimistic version for explicit recipient open", async () => {
    const letterId = "50000000-0000-4000-8000-000000000001";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: letterId,
        version: 4,
        status: "OPENED",
        bodyAvailable: true,
        content: "现在可以读了",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stageSixApi.openCalmLetter(letterId, { version: 3 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/v1/calm-letters/${letterId}/open`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ version: 3 });
  });
});
