import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { NoStoreMiddleware } from "./common/http/no-store.middleware";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { StructuredRequestLogMiddleware } from "./common/http/structured-request-log.middleware";
import { AppConfigModule } from "./config/config.module";
import { CouplesModule } from "./couples/couples.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { NotesModule } from "./notes/notes.module";
import { PlacesModule } from "./places/places.module";
import { StatusesModule } from "./statuses/statuses.module";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    PrismaModule,
    IdentityModule,
    CouplesModule,
    StatusesModule,
    NotesModule,
    PlacesModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        RequestIdMiddleware,
        StructuredRequestLogMiddleware,
        NoStoreMiddleware,
      )
      .forRoutes("{*path}");
  }
}
