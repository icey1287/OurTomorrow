import { Module } from "@nestjs/common";
import { AnniversariesModule } from "../anniversaries/anniversaries.module";
import { IdentityModule } from "../identity/identity.module";
import { CouplesController } from "./couples.controller";
import { CouplesService } from "./couples.service";

@Module({
  imports: [IdentityModule, AnniversariesModule],
  controllers: [CouplesController],
  providers: [CouplesService],
  exports: [CouplesService],
})
export class CouplesModule {}
