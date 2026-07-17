import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { AuditModule } from "./common/audit/audit.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { NoStoreMiddleware } from "./common/http/no-store.middleware";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { CouplesModule } from "./couples/couples.module";
import { DailyEntriesModule } from "./daily-entries/daily-entries.module";
import { IdentityModule } from "./identity/identity.module";
import { MediaModule } from "./media/media.module";
import { MemoriesModule } from "./memories/memories.module";
import { MoodsModule } from "./moods/moods.module";
import { NotesModule } from "./notes/notes.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PlacesModule } from "./places/places.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { StatusesModule } from "./statuses/statuses.module";
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
    StatusesModule,
    MoodsModule,
    DailyEntriesModule,
    NotesModule,
    NotificationsModule,
    MediaModule,
    TagsModule,
    PlacesModule,
    MemoriesModule,
    RealtimeModule,
    TodayModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, NoStoreMiddleware).forRoutes("{*path}");
  }
}
