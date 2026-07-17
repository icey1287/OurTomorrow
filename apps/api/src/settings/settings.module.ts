import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DataStatusController } from "./data-status.controller";
import { DataStatusService } from "./data-status.service";

@Module({
  imports: [IdentityModule],
  controllers: [DataStatusController],
  providers: [DataStatusService],
  exports: [DataStatusService],
})
export class SettingsModule {}
