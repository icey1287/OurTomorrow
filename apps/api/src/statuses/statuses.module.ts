import { Module } from "@nestjs/common";
import { ClockModule } from "../common/clock/clock.module";
import { IdentityModule } from "../identity/identity.module";
import { StatusesController } from "./statuses.controller";
import { StatusesService } from "./statuses.service";

@Module({
  imports: [ClockModule, IdentityModule],
  controllers: [StatusesController],
  providers: [StatusesService],
  exports: [StatusesService],
})
export class StatusesModule {}
