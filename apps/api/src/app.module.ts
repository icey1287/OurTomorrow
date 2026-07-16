import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [AppConfigModule, ClockModule, PrismaModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
