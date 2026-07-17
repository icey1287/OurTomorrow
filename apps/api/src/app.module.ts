import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { AuditModule } from "./common/audit/audit.module";
import { AnniversariesModule } from "./anniversaries/anniversaries.module";
import { CapsulesModule } from "./capsules/capsules.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { NoStoreMiddleware } from "./common/http/no-store.middleware";
import { StructuredRequestLogMiddleware } from "./common/http/structured-request-log.middleware";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { CouplesModule } from "./couples/couples.module";
import { ConversionsModule } from "./conversions/conversions.module";
import { DailyEntriesModule } from "./daily-entries/daily-entries.module";
import { ExportsModule } from "./exports/exports.module";
import { IdentityModule } from "./identity/identity.module";
import { MediaModule } from "./media/media.module";
import { MemoriesModule } from "./memories/memories.module";
import { MoodsModule } from "./moods/moods.module";
import { NotesModule } from "./notes/notes.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PlacesModule } from "./places/places.module";
import { PlansModule } from "./plans/plans.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RecycleBinModule } from "./recycle-bin/recycle-bin.module";
import { StatusesModule } from "./statuses/statuses.module";
import { SettingsModule } from "./settings/settings.module";
import { TagsModule } from "./tags/tags.module";
import { TodayModule } from "./today/today.module";
import { UsersModule } from "./users/users.module";
import { WishesModule } from "./wishes/wishes.module";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    IdempotencyModule,
    PrismaModule,
    AuditModule,
    IdentityModule,
    CouplesModule,
    ConversionsModule,
    UsersModule,
    WishesModule,
    PlansModule,
    AnniversariesModule,
    CapsulesModule,
    StatusesModule,
    MoodsModule,
    DailyEntriesModule,
    NotesModule,
    NotificationsModule,
    MediaModule,
    TagsModule,
    PlacesModule,
    MemoriesModule,
    RecycleBinModule,
    ExportsModule,
    SettingsModule,
    RealtimeModule,
    TodayModule,
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
