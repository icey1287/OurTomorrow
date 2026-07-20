import type { NoteImageUpload } from "@our-tomorrow/contracts";

const NOTE_IMAGE_MAX_BYTES = 1_500_000;
const MAX_SOURCE_BYTES = 25_000_000;
const IMAGE_DECODE_TIMEOUT_MS = 15_000;

export type PreparedNoteImage = {
  upload: NoteImageUpload;
  previewUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  orientation: NoteImageOrientation;
};

export type NoteImageOrientation = "portrait" | "landscape" | "square";

type CompressionAttempt = {
  maxDimension: number;
  quality: number;
};

type RenderedJpeg = {
  blob: Blob;
  width: number;
  height: number;
};

const COMPRESSION_ATTEMPTS: CompressionAttempt[] = [
  { maxDimension: 1_600, quality: 0.84 },
  { maxDimension: 1_600, quality: 0.68 },
  { maxDimension: 1_280, quality: 0.72 },
  { maxDimension: 1_024, quality: 0.7 },
];

function loadImage(file: File): Promise<{
  image: HTMLImageElement;
  release: () => void;
}> {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      URL.revokeObjectURL(source);
      reject(new Error("照片读取花了太久，请换一张再试。"));
    }, IMAGE_DECODE_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve({ image, release: () => URL.revokeObjectURL(source) });
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(source);
      reject(new Error("这张图片暂时无法读取，请换一张再试。"));
    };
    image.src = source;
  });
}

function renderJpeg(
  image: HTMLImageElement,
  attempt: CompressionAttempt,
): Promise<RenderedJpeg> {
  const scale = Math.min(
    1,
    attempt.maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器暂时无法处理照片。");
  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve({ blob, width, height });
        else reject(new Error("照片压缩失败，请换一张再试。"));
      },
      "image/jpeg",
      attempt.quality,
    );
  });
}

export function noteImageOrientation(
  width: number,
  height: number,
): NoteImageOrientation {
  const ratio = width / height;
  if (ratio < 0.92) return "portrait";
  if (ratio > 1.08) return "landscape";
  return "square";
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const comma = value.indexOf(",");
      if (comma < 0) {
        reject(new Error("照片编码失败，请换一张再试。"));
        return;
      }
      resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("照片编码失败，请换一张再试。"));
    reader.readAsDataURL(blob);
  });
}

export async function prepareNoteImage(file: File): Promise<PreparedNoteImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择一张图片。");
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new Error("原图太大了，请选择 25MB 以内的照片。");
  }

  const loaded = await loadImage(file);
  try {
    if (!loaded.image.naturalWidth || !loaded.image.naturalHeight) {
      throw new Error("这张图片没有可用的尺寸信息。");
    }
    for (const attempt of COMPRESSION_ATTEMPTS) {
      const rendered = await renderJpeg(loaded.image, attempt);
      if (rendered.blob.size > NOTE_IMAGE_MAX_BYTES) continue;
      return {
        upload: {
          mimeType: "image/jpeg",
          dataBase64: await blobBase64(rendered.blob),
        },
        previewUrl: URL.createObjectURL(rendered.blob),
        sizeBytes: rendered.blob.size,
        width: rendered.width,
        height: rendered.height,
        orientation: noteImageOrientation(rendered.width, rendered.height),
      };
    }
  } finally {
    loaded.release();
  }
  throw new Error("照片压缩后仍然太大，请换一张再试。");
}
