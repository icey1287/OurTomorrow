import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http/http-exception.filter";
import { createValidationPipe } from "./common/http/validation";
import type { Environment } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Environment, true>);
  const logger = new Logger("Bootstrap");

  app.useLogger(logger);
  app.setGlobalPrefix("api/v1");
  if (config.get("TRUST_PROXY", { infer: true })) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }
  app.use(helmet());
  app.enableCors({
    origin: config.get("WEB_ORIGIN", { infer: true }),
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle("OurTomorrow API")
    .setDescription("Private API for the OurTomorrow shared space.")
    .setVersion(config.get("APP_VERSION", { infer: true }))
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-Our-Tomorrow-Role",
        description: "Local two-person identity choice: boy or girl",
      },
      "local-role",
    )
    .build();
  SwaggerModule.setup(
    "api/v1/docs",
    app,
    SwaggerModule.createDocument(app, swagger),
    {
      jsonDocumentUrl: "api/v1/openapi.json",
    },
  );

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  logger.log(`API listening on http://0.0.0.0:${port}/api/v1`);
}

void bootstrap().catch((error: unknown) => {
  new Logger("Bootstrap").error(
    "API failed to start",
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
