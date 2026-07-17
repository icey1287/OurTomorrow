import { expect, test } from "@playwright/test";

test("the production PWA keeps only the app shell available offline", async ({
  context,
  page,
}) => {
  test.skip(
    process.env.E2E_PWA !== "true",
    "PWA verification requires a production build served by Vite preview.",
  );

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are unavailable");
    }
    await navigator.serviceWorker.ready;
  });

  // The first controlled navigation stores the generic SPA shell and hashed
  // static assets. Private API traffic remains network-only.
  await page.reload();
  await page.evaluate(() =>
    fetch("/api/v1/health/live").catch(() => undefined),
  );
  const cachedUrls = await page.evaluate(async () => {
    const result: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      result.push(...(await cache.keys()).map((request) => request.url));
    }
    return result;
  });
  expect(
    cachedUrls.some((url) => new URL(url).pathname.startsWith("/api/")),
  ).toBe(false);
  expect(
    cachedUrls.some((url) => new URL(url).pathname.startsWith("/socket/")),
  ).toBe(false);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "输入你的名字" }),
    ).toBeVisible();
    await expect(page.getByText(/当前离线/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
