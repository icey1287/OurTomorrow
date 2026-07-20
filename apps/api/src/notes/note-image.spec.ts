import { ApiException } from "../common/http/api-exception";
import { describe, expect, test } from "vitest";
import { decodeNoteImage } from "./note-image";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZ4h8AAAAASUVORK5CYII=";

describe("decodeNoteImage", () => {
  test("accepts a small image whose bytes match its declared type", () => {
    const image = decodeNoteImage({
      mimeType: "image/png",
      dataBase64: TINY_PNG_BASE64,
    });

    expect(image).toMatchObject({
      mimeType: "image/png",
      sizeBytes: Buffer.from(TINY_PNG_BASE64, "base64").length,
    });
  });

  test("rejects content whose signature does not match its declared type", () => {
    expect(() =>
      decodeNoteImage({
        mimeType: "image/jpeg",
        dataBase64: TINY_PNG_BASE64,
      }),
    ).toThrow(ApiException);
  });
});
