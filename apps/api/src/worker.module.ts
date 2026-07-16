import { Module } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { SchedulerModule } from "./scheduler/scheduler.module";

@Module({
  imports: [AppConfigModule, ClockModule, PrismaModule, SchedulerModule],
})
export class WorkerModule {}
