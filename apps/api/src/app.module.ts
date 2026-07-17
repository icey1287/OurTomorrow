import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { AuditModule } from "./common/audit/audit.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { NoStoreMiddleware } from "./common/http/no-store.middleware";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { CouplesModule } from "./couples/couples.module";
import { IdentityModule } from "./identity/identity.module";
import { MediaModule } from "./media/media.module";
import { MemoriesModule } from "./memories/memories.module";
import { PlacesModule } from "./places/places.module";
import { TagsModule } from "./tags/tags.module";
import { TodayModule } from "./today/today.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    PrismaModule,
    AuditModule,
    IdentityModule,
    CouplesModule,
    UsersModule,
    MediaModule,
    TagsModule,
    PlacesModule,
    MemoriesModule,
    TodayModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, NoStoreMiddleware).forRoutes("{*path}");
  }
}
