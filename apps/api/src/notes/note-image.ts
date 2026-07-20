import { validationFailed } from "../common/http/api-exception";
import {
  NOTE_IMAGE_MIME_TYPES,
  type CreateNoteImageDto,
  type NoteImageMimeType,
} from "./dto/note.dto";

const NOTE_IMAGE_MAX_BYTES = 1_500_000;

export type StoredNoteImage = {
  data: Buffer;
  mimeType: NoteImageMimeType;
  sizeBytes: number;
};

function detectedMimeType(data: Buffer): NoteImageMimeType | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function decodeNoteImage(
  input: CreateNoteImageDto | null | undefined,
): StoredNoteImage | null {
  if (!input) return null;
  if (!NOTE_IMAGE_MIME_TYPES.includes(input.mimeType)) {
    throw validationFailed("Unsupported note image type");
  }
  if (
    input.dataBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.dataBase64)
  ) {
    throw validationFailed("Note image is not valid base64 data");
  }

  const data = Buffer.from(input.dataBase64, "base64");
  if (!data.length || data.length > NOTE_IMAGE_MAX_BYTES) {
    throw validationFailed("Note image exceeds the allowed size");
  }
  if (data.toString("base64") !== input.dataBase64) {
    throw validationFailed("Note image is not canonical base64 data");
  }
  if (detectedMimeType(data) !== input.mimeType) {
    throw validationFailed("Note image content does not match its type");
  }

  return { data, mimeType: input.mimeType, sizeBytes: data.length };
}
