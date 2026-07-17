import { Module } from "@nestjs/common";
import { AuditModule } from "../common/audit/audit.module";
import { IdentityModule } from "../identity/identity.module";
import { CapsulesController } from "./capsules.controller";
import { CapsulesService } from "./capsules.service";

@Module({
  imports: [AuditModule, IdentityModule],
  controllers: [CapsulesController],
  providers: [CapsulesService],
  exports: [CapsulesService],
})
export class CapsulesModule {}
