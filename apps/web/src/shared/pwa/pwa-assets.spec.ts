import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const publicRoot = new URL("../../../public/", import.meta.url);

describe("PWA privacy policy", () => {
  it("ships installable manifest icons including a maskable icon", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("manifest.webmanifest", publicRoot), "utf8"),
    ) as {
      display: string;
      icons: Array<{ sizes: string; purpose: string }>;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(
      true,
    );
  });

  it("keeps API and socket traffic outside service-worker caches", async () => {
    const worker = await readFile(new URL("sw.js", publicRoot), "utf8");
    expect(worker).toContain('const PRIVATE_PREFIXES = ["/api/", "/socket/"]');
    expect(worker).toContain(
      "if (url.origin !== self.location.origin || isPrivateRequest(url)) return;",
    );
    expect(worker).not.toMatch(/cache\.put\([^\n]*(?:\/api\/|\/socket\/)/);
  });
});
