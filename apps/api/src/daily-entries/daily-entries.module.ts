import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DailyEntriesController } from "./daily-entries.controller";
import { DailyEntriesService } from "./daily-entries.service";

@Module({
  imports: [IdentityModule],
  controllers: [DailyEntriesController],
  providers: [DailyEntriesService],
  exports: [DailyEntriesService],
})
export class DailyEntriesModule {}
