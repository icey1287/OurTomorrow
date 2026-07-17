import type {
  ConversionSourceType,
  ConversionTargetType,
  Prisma,
} from "@prisma/client";
import { stateConflict } from "../common/http/api-exception";

export type ConversionResult = {
  sourceType: ConversionSourceType;
  sourceId: string;
  targetType: ConversionTargetType;
  targetId: string;
  convertedAt: string;
};

export function toStoredConversion(
  conversion: ConversionResult,
): Prisma.InputJsonObject {
  return { ...conversion };
}

export function parseStoredConversion(value: unknown): ConversionResult {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw stateConflict();
  }
  const item = value as Record<string, unknown>;
  if (
    !["NOTE", "WISH", "CAPSULE", "ANNIVERSARY"].includes(
      String(item.sourceType),
    ) ||
    typeof item.sourceId !== "string" ||
    !["MEMORY", "WISH", "ANNIVERSARY"].includes(String(item.targetType)) ||
    typeof item.targetId !== "string" ||
    typeof item.convertedAt !== "string"
  ) {
    throw stateConflict();
  }
  return item as ConversionResult;
}
