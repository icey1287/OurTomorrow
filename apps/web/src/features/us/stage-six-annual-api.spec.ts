import { afterEach, describe, expect, it, vi } from "vitest";

import { setApiIdentityRole } from "@/shared/api/client";
import { annualReviewApi } from "@/shared/api/stage-six-annual";

afterEach(() => {
  vi.unstubAllGlobals();
  setApiIdentityRole(null);
});

describe("annual review API", () => {
  it("loads photo choices from the year-scoped published-memory endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("boy");

    await annualReviewApi.mediaOptions(2026);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/annual-reviews/2026/media-options");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("X-Our-Tomorrow-Role")).toBe("boy");
  });

  it("queues a year and updates only the selected role contribution", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "review-1", year: 2025 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    setApiIdentityRole("girl");

    await annualReviewApi.request(2025);
    await annualReviewApi.update(2025, {
      version: 2,
      selectedMediaId: "20000000-0000-4000-8000-000000000001",
      message: "这一年，我们走了很远。",
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestUrl).toBe("/api/v1/annual-reviews/2025");
    expect(requestInit.method).toBe("POST");
    expect(new Headers(requestInit.headers).get("X-Our-Tomorrow-Role")).toBe(
      "girl",
    );

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(updateUrl).toBe("/api/v1/annual-reviews/2025");
    expect(updateInit.method).toBe("PATCH");
    expect(JSON.parse(String(updateInit.body))).toMatchObject({
      version: 2,
      message: "这一年，我们走了很远。",
    });
  });
});
