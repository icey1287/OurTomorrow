import { Module } from "@nestjs/common";
import { AnniversariesModule } from "../anniversaries/anniversaries.module";
import { AnnualReviewsModule } from "../annual-reviews/annual-reviews.module";
import { CalmLettersModule } from "../calm-letters/calm-letters.module";
import { CapsulesModule } from "../capsules/capsules.module";
import { MemoriesModule } from "../memories/memories.module";
import { PlansModule } from "../plans/plans.module";
import { RecycleBinModule } from "../recycle-bin/recycle-bin.module";
import { SchedulerWorkerService } from "./scheduler-worker.service";

@Module({
  imports: [
    PlansModule,
    AnniversariesModule,
    AnnualReviewsModule,
    CapsulesModule,
    RecycleBinModule,
    CalmLettersModule,
    MemoriesModule,
  ],
  providers: [SchedulerWorkerService],
  exports: [SchedulerWorkerService],
})
export class SchedulerModule {}
