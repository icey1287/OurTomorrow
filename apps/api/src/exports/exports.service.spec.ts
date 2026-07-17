import { createHash } from "node:crypto";
import { promises as fileSystem } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { ExportFormat } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";
import { SystemClock } from "../common/clock/system-clock";
import type { Environment } from "../config/env.schema";
import { resolveStoragePath } from "../media/media-storage";
import { ExportsService } from "./exports.service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fileSystem.rm(root, { recursive: true, force: true })),
  );
});

async function service(): Promise<{
  exportsService: ExportsService;
  root: string;
}> {
  const root = await fileSystem.mkdtemp(
    path.join(os.tmpdir(), "our-tomorrow-export-"),
  );
  roots.push(root);
  const config = {
    get(key: keyof Environment) {
      if (key === "MEDIA_STORAGE_PATH") return root;
      throw new Error(`Unexpected config key ${key}`);
    },
  } as unknown as ConfigService<Environment, true>;
  return {
    root,
    exportsService: new ExportsService(
      undefined as never,
      undefined as never,
      undefined as never,
      new SystemClock(),
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      config,
    ),
  };
}

function writer(exportsService: ExportsService) {
  return exportsService as unknown as {
    writeExport(
      exportId: string,
      format: ExportFormat,
      data: Record<string, unknown>,
      media: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        size: bigint;
        checksumSha256: string | null;
        storageKey: string;
      }>,
    ): Promise<{ storageKey: string; checksum: string }>;
  };
}

describe("ExportsService package writer", () => {
  it("creates an atomic ZIP with versioned metadata and safe media paths", async () => {
    const { exportsService, root } = await service();
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const storageKey = `media/11/${mediaId}/original.webp`;
    const source = resolveStoragePath(root, storageKey);
    await fileSystem.mkdir(path.dirname(source), { recursive: true });
    await fileSystem.writeFile(source, Buffer.from("private-image"));

    const result = await writer(exportsService).writeExport(
      "22222222-2222-4222-8222-222222222222",
      ExportFormat.ZIP,
      { format: "our-tomorrow-data", version: 1, note: "private-note" },
      [
        {
          id: mediaId,
          originalName: "../海边/照片.webp",
          mimeType: "image/webp",
          size: 13n,
          checksumSha256: null,
          storageKey,
        },
      ],
    );

    const output = resolveStoragePath(root, result.storageKey);
    const bytes = await fileSystem.readFile(output);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const archiveIndex = bytes.toString("latin1");
    expect(archiveIndex).toContain("manifest.json");
    expect(archiveIndex).toContain("data.json");
    expect(archiveIndex).toContain(`media/${mediaId}/`);
    expect(archiveIndex).toContain(".webp");
    expect(archiveIndex).not.toContain("../");
    expect(archiveIndex).not.toContain(storageKey);
    expect(result.checksum).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(
      (await fileSystem.readdir(path.join(root, "exports"))).some((name) =>
        name.endsWith(".part"),
      ),
    ).toBe(false);
  });

  it("keeps internal storage keys out of JSON exports", async () => {
    const { exportsService, root } = await service();
    const mediaId = "11111111-1111-4111-8111-111111111111";
    const storageKey = `media/11/${mediaId}/original.webp`;
    const source = resolveStoragePath(root, storageKey);
    await fileSystem.mkdir(path.dirname(source), { recursive: true });
    await fileSystem.writeFile(source, Buffer.from("private-image"));

    const result = await writer(exportsService).writeExport(
      "33333333-3333-4333-8333-333333333333",
      ExportFormat.JSON,
      { format: "our-tomorrow-data", version: 1 },
      [
        {
          id: mediaId,
          originalName: "photo.webp",
          mimeType: "image/webp",
          size: 13n,
          checksumSha256: "checksum",
          storageKey,
        },
      ],
    );

    const body = await fileSystem.readFile(
      resolveStoragePath(root, result.storageKey),
      "utf8",
    );
    expect(body).toContain(`media/${mediaId}/photo.webp`);
    expect(body).not.toContain(storageKey);
  });
});
