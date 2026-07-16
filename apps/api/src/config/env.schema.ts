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
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) =>
          value.startsWith("postgresql://") || value.startsWith("postgres://"),
        {
          message: "DATABASE_URL must use PostgreSQL",
        },
      ),
    WEB_ORIGIN: z.string().url(),
    PUBLIC_APP_URL: z.string().url(),
    MEDIA_STORAGE_PATH: z.string().min(1).default("./storage"),
    MEDIA_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .default(15 * 1024 * 1024),
    WORKER_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(2_000),
    WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
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

    if (value.NODE_ENV === "production") {
      for (const key of ["WEB_ORIGIN", "PUBLIC_APP_URL"] as const) {
        if (!isSecureApplicationUrl(value[key])) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must use HTTPS in production`,
          });
        }
      }
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
