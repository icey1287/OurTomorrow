import { z } from "zod";

const booleanFromEnv = z.preprocess(
  (value) => (typeof value === "boolean" ? String(value) : value),
  z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
);

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return date.toISOString().slice(0, 10) === value;
}

function normalizeIdentityName(value: string): string {
  return value.normalize("NFKC");
}

function isSecureApplicationUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
  );
}

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AMAP_WEB_SERVICE_KEY: z.string().trim().default(""),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    BOY_REAL_NAME: z.string().trim().min(1).max(80),
    GIRL_REAL_NAME: z.string().trim().min(1).max(80),
    BOY_DISPLAY_NAME: z.string().trim().min(1).max(40),
    GIRL_DISPLAY_NAME: z.string().trim().min(1).max(40),
    COUPLE_NAME: z.string().trim().min(1).max(80),
    COUPLE_START_DATE: z
      .string()
      .trim()
      .refine(isValidLocalDate, "COUPLE_START_DATE must be YYYY-MM-DD"),
    COUPLE_TIMEZONE: z.string().trim().min(1),
    COUPLE_SIGNATURE: z.string().trim().max(120).default(""),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) =>
          value.startsWith("postgresql://") || value.startsWith("postgres://"),
        { message: "DATABASE_URL must use PostgreSQL" },
      ),
    WEB_ORIGIN: z.string().url(),
    TRUST_PROXY: booleanFromEnv,
    TZ: z.string().min(1).default("Asia/Shanghai"),
    APP_VERSION: z.string().min(1).default("0.1.0"),
  })
  .superRefine((value, context) => {
    if (!isValidTimeZone(value.TZ)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TZ"],
        message: "TZ must be a valid IANA time zone",
      });
    }
    if (!isValidTimeZone(value.COUPLE_TIMEZONE)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COUPLE_TIMEZONE"],
        message: "COUPLE_TIMEZONE must be a valid IANA time zone",
      });
    }
    if (
      normalizeIdentityName(value.BOY_REAL_NAME) ===
      normalizeIdentityName(value.GIRL_REAL_NAME)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GIRL_REAL_NAME"],
        message: "the two configured real names must be different",
      });
    }
    if (
      value.NODE_ENV === "production" &&
      !isSecureApplicationUrl(value.WEB_ORIGIN)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEB_ORIGIN"],
        message: "WEB_ORIGIN must use HTTPS in production",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
