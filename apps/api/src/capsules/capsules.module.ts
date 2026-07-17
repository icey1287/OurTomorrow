import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { CapsulesController } from "./capsules.controller";
import { CapsulesService } from "./capsules.service";

@Module({
  imports: [IdentityModule],
  controllers: [CapsulesController],
  providers: [CapsulesService],
  exports: [CapsulesService],
})
export class CapsulesModule {}
