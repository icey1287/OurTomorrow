import { Module } from "@nestjs/common";
import { SchedulerWorkerService } from "./scheduler-worker.service";

@Module({
  providers: [SchedulerWorkerService],
  exports: [SchedulerWorkerService],
})
export class SchedulerModule {}
