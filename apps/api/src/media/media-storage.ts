import path from "node:path";
import type { Metadata } from "sharp";

const INPUT_MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type SupportedInputMime =
  (typeof INPUT_MIME_BY_FORMAT)[keyof typeof INPUT_MIME_BY_FORMAT];

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Invalid media storage key");
    this.name = "InvalidStorageKeyError";
  }
}

export function normalizeMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

export function validateImageMetadata(
  metadata: Metadata,
  declaredMimeType: string,
  maxPixels: number,
): SupportedInputMime {
  const format = metadata.format as keyof typeof INPUT_MIME_BY_FORMAT;
  const actualMimeType = INPUT_MIME_BY_FORMAT[format];
  if (!actualMimeType) {
    throw new InvalidImageError("Only JPEG, PNG, and WebP images are allowed");
  }
  if (normalizeMimeType(declaredMimeType) !== actualMimeType) {
    throw new InvalidImageError(
      "The decoded image type does not match the declared MIME type",
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new InvalidImageError(
      "Animated and multi-page images are not allowed",
    );
  }

  const { width, height } = metadata;
  if (
    width === undefined ||
    height === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new InvalidImageError("The image dimensions are invalid");
  }
  if (width > Math.floor(maxPixels / height)) {
    throw new InvalidImageError("The image pixel count exceeds the limit");
  }
  return actualMimeType;
}

export function processedExtensionForMime(
  declaredMimeType: string,
): "jpg" | "webp" {
  return normalizeMimeType(declaredMimeType) === "image/jpeg" ? "jpg" : "webp";
}

export function mediaStorageKey(
  mediaId: string,
  extension: "jpg" | "webp",
): string {
  return `media/${mediaId.slice(0, 2)}/${mediaId}/original.${extension}`;
}

export function thumbnailStorageKey(mediaId: string): string {
  return `media/${mediaId.slice(0, 2)}/${mediaId}/thumbnail.webp`;
}

export function stagingStorageKey(mediaId: string): string {
  return `staging/${mediaId}`;
}

export function quarantineStorageKey(mediaId: string, timestamp: Date): string {
  const safeTimestamp = timestamp.toISOString().replaceAll(":", "-");
  return `quarantine/${mediaId}/${safeTimestamp}-source.bin`;
}

export function resolveStoragePath(rootDirectory: string, key: string): string {
  if (
    key.length === 0 ||
    key.includes("\0") ||
    key.includes("\\") ||
    path.isAbsolute(key) ||
    path.win32.isAbsolute(key) ||
    key
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new InvalidStorageKeyError();
  }

  const root = path.resolve(rootDirectory);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new InvalidStorageKeyError();
  }
  return target;
}
