import { Module } from "@nestjs/common";
import { CouplesModule } from "../couples/couples.module";
import { DailyEntriesModule } from "../daily-entries/daily-entries.module";
import { MemoriesModule } from "../memories/memories.module";
import { NotesModule } from "../notes/notes.module";
import { StatusesModule } from "../statuses/statuses.module";
import { TodayController } from "./today.controller";
import { TodayService } from "./today.service";

@Module({
  imports: [
    CouplesModule,
    MemoriesModule,
    StatusesModule,
    DailyEntriesModule,
    NotesModule,
  ],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
