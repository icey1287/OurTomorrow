import { Module } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module";
import { AppConfigModule } from "./config/config.module";
import { PrismaModule } from "./database/prisma.module";
import { WorkerHeartbeatService } from "./health/worker-heartbeat.service";
import { IdentityModule } from "./identity/identity.module";
import { SchedulerModule } from "./scheduler/scheduler.module";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    PrismaModule,
    IdentityModule,
    SchedulerModule,
  ],
  providers: [WorkerHeartbeatService],
})
export class WorkerModule {}
