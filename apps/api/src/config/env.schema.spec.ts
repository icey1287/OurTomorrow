import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./env.schema";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://our_tomorrow:secret@localhost:5432/our_tomorrow",
  WEB_ORIGIN: "http://localhost:5173",
  PUBLIC_APP_URL: "http://localhost:5173",
  BOOTSTRAP_TOKEN: "a".repeat(32),
};

describe("validateEnvironment", () => {
  it("coerces values and supplies safe application defaults", () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      API_PORT: "3100",
      SESSION_TTL_DAYS: "14",
      SESSION_COOKIE_SECURE: "true",
      TRUST_PROXY: "1",
    });

    expect(environment).toMatchObject({
      API_PORT: 3100,
      SESSION_TTL_DAYS: 14,
      SESSION_COOKIE_NAME: "our_tomorrow_session",
      SESSION_COOKIE_SECURE: true,
      TRUST_PROXY: true,
      TZ: "Asia/Shanghai",
      WORKER_POLL_INTERVAL_MS: 2_000,
    });
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost/app",
      }),
    ).toThrow("DATABASE_URL must use PostgreSQL");
  });

  it("validates the configured IANA time zone rather than process globals", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, TZ: "Mars/Olympus_Mons" }),
    ).toThrow("TZ must be a valid IANA time zone");
  });

  it("requires HTTPS origins and a non-placeholder bootstrap secret in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "http://ourtomorrow.example.com",
        PUBLIC_APP_URL: "http://ourtomorrow.example.com",
        BOOTSTRAP_TOKEN: "replace-with-a-long-random-secret",
      }),
    ).toThrow(
      /must use HTTPS in production.*must not be a placeholder in production/,
    );
  });

  it("accepts a hardened production configuration", () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
      WEB_ORIGIN: "https://ourtomorrow.example.com",
      PUBLIC_APP_URL: "https://ourtomorrow.example.com",
      BOOTSTRAP_TOKEN: "b".repeat(48),
      SESSION_COOKIE_SECURE: "true",
      TZ: "Asia/Shanghai",
    });

    expect(environment.NODE_ENV).toBe("production");
  });

  it("requires secure cookies for production HTTPS", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://ourtomorrow.example.com",
        PUBLIC_APP_URL: "https://ourtomorrow.example.com",
        BOOTSTRAP_TOKEN: "b".repeat(48),
        SESSION_COOKIE_SECURE: "false",
      }),
    ).toThrow("SESSION_COOKIE_SECURE must be true for production HTTPS");
  });
});
