import { Module } from "@nestjs/common";
import { AnniversariesModule } from "../anniversaries/anniversaries.module";
import { CapsulesModule } from "../capsules/capsules.module";
import { CouplesModule } from "../couples/couples.module";
import { DailyEntriesModule } from "../daily-entries/daily-entries.module";
import { MemoriesModule } from "../memories/memories.module";
import { NotesModule } from "../notes/notes.module";
import { PlansModule } from "../plans/plans.module";
import { StatusesModule } from "../statuses/statuses.module";
import { WishesModule } from "../wishes/wishes.module";
import { TodayController } from "./today.controller";
import { TodayService } from "./today.service";

@Module({
  imports: [
    CouplesModule,
    MemoriesModule,
    StatusesModule,
    DailyEntriesModule,
    NotesModule,
    AnniversariesModule,
    WishesModule,
    PlansModule,
    CapsulesModule,
  ],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
