import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { stageSixMapsApi } from "@/shared/api/stage-six-maps";

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("stage six maps API", () => {
  it("loads the relationship map with the selected local identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        serverNow: "2026-07-17T08:00:00.000Z",
        history: [],
        future: [],
        withoutCoordinates: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await stageSixMapsApi.map();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/places/map");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("girl");
    expect(init.credentials).toBe("omit");
  });

  it("sends dual-axis status changes with an optimistic version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "place-1",
        version: 8,
        historyState: "VISITED",
        futureState: "COMPLETED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await stageSixMapsApi.updateStatus("place-1", {
      version: 7,
      futureState: "COMPLETED",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/places/place-1/status");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      version: 7,
      futureState: "COMPLETED",
    });
  });

  it("creates an explicitly entered future coordinate without requesting location", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "place-2",
        version: 1,
        name: "雷克雅未克",
        historyState: "UNVISITED",
        futureState: "WANT_TO_GO",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stageSixMapsApi.createPlace({
      name: "雷克雅未克",
      latitude: 64.1466,
      longitude: -21.9426,
      historyState: "UNVISITED",
      futureState: "WANT_TO_GO",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/places");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      latitude: 64.1466,
      longitude: -21.9426,
      historyState: "UNVISITED",
      futureState: "WANT_TO_GO",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
