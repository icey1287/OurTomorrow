import { Module } from "@nestjs/common";
import { AnniversariesModule } from "../anniversaries/anniversaries.module";
import { CapsulesModule } from "../capsules/capsules.module";
import { PlansModule } from "../plans/plans.module";
import { SchedulerWorkerService } from "./scheduler-worker.service";

@Module({
  imports: [PlansModule, AnniversariesModule, CapsulesModule],
  providers: [SchedulerWorkerService],
  exports: [SchedulerWorkerService],
})
export class SchedulerModule {}
