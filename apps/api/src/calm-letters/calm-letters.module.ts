import { Module } from "@nestjs/common";
import { AuditModule } from "../common/audit/audit.module";
import { ClockModule } from "../common/clock/clock.module";
import { IdentityModule } from "../identity/identity.module";
import { CalmLettersController } from "./calm-letters.controller";
import { CalmLettersService } from "./calm-letters.service";

@Module({
  imports: [AuditModule, ClockModule, IdentityModule],
  controllers: [CalmLettersController],
  providers: [CalmLettersService],
  exports: [CalmLettersService],
})
export class CalmLettersModule {}
