import { Module } from "@nestjs/common";
import { ClockModule } from "../common/clock/clock.module";
import { IdentityModule } from "../identity/identity.module";
import { MoodsController } from "./moods.controller";
import { MoodsService } from "./moods.service";

@Module({
  imports: [ClockModule, IdentityModule],
  controllers: [MoodsController],
  providers: [MoodsService],
  exports: [MoodsService],
})
export class MoodsModule {}
