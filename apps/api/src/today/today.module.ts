import { Module } from "@nestjs/common";
import { CouplesModule } from "../couples/couples.module";
import { TodayController } from "./today.controller";
import { TodayService } from "./today.service";

@Module({
  imports: [CouplesModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
