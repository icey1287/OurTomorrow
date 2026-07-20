import { defineConfig, devices } from "@playwright/test";

const localApiPort = process.env.E2E_API_PORT ?? "3103";
const reuseExistingLocalServer = process.env.E2E_DATABASE_URL
  ? false
  : !process.env.CI;
const localServerEnvironment = {
  ...(process.env.E2E_DATABASE_URL
    ? { DATABASE_URL: process.env.E2E_DATABASE_URL }
    : {}),
  API_PORT: localApiPort,
  VITE_DEV_API_TARGET: `http://127.0.0.1:${localApiPort}`,
  WEB_ORIGIN: "http://localhost:5173",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "pnpm --filter @our-tomorrow/api dev",
          env: localServerEnvironment,
          name: "API",
          url: `http://127.0.0.1:${localApiPort}/api/v1/health/live`,
          reuseExistingServer: reuseExistingLocalServer,
          timeout: 120_000,
        },
        {
          command: "pnpm --filter @our-tomorrow/web dev",
          env: localServerEnvironment,
          name: "Web",
          url: "http://localhost:5173",
          reuseExistingServer: reuseExistingLocalServer,
          timeout: 120_000,
        },
      ],
});
