import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
    BOY_REAL_NAME: "示例用户甲",
    GIRL_REAL_NAME: "示例用户乙",
    BOY_DISPLAY_NAME: "甲",
    GIRL_DISPLAY_NAME: "乙",
    COUPLE_NAME: "我们的明天",
    COUPLE_START_DATE: "2024-01-01",
    COUPLE_TIMEZONE: "UTC",
    COUPLE_SIGNATURE: "一起记录普通的日子。",
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    TRUST_PROXY: "false",
    TZ: "UTC",
    APP_VERSION: "integration",
  });

  const { AppModule } = await import("../../src/app.module");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });
  app.useBodyParser("json", { limit: "3mb" });
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
