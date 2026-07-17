import { Module } from "@nestjs/common";
import { ClockModule } from "../common/clock/clock.module";
import { IdentityModule } from "../identity/identity.module";
import { TouchEventsController } from "./touch-events.controller";
import { TouchEventsService } from "./touch-events.service";

@Module({
  imports: [ClockModule, IdentityModule],
  controllers: [TouchEventsController],
  providers: [TouchEventsService],
  exports: [TouchEventsService],
})
export class TouchEventsModule {}
