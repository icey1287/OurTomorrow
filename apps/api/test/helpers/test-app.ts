import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";

import { HttpExceptionFilter } from "../../src/common/http/http-exception.filter";
import { createValidationPipe } from "../../src/common/http/validation";

export type RunningTestApplication = {
  app: INestApplication;
  baseUrl: string;
};

const TEST_WEB_ORIGIN = "http://127.0.0.1:5173";

export async function startTestApplication(
  databaseUrl: string,
): Promise<RunningTestApplication> {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    PUBLIC_APP_URL: TEST_WEB_ORIGIN,
    MEDIA_STORAGE_PATH: "/tmp/our-tomorrow-stage1-media",
    MEDIA_MAX_BYTES: "15728640",
    WORKER_POLL_INTERVAL_MS: "2000",
    WORKER_BATCH_SIZE: "20",
    TRUST_PROXY: "false",
    TZ: "UTC",
    APP_VERSION: "stage1-integration",
  });

  const { AppModule } = await import("../../src/app.module");
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: TEST_WEB_ORIGIN,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    await app.close();
    throw new Error("The integration HTTP server did not expose an address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}
