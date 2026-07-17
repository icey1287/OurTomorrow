import { validationFailed } from "../http/api-exception";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

export function parseIdempotencyKey(value: string | undefined): string {
  if (
    value === undefined ||
    value.length < 8 ||
    value.length > 128 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw validationFailed(
      "Idempotency-Key must contain 8 to 128 visible ASCII characters",
    );
  }
  return value;
}
