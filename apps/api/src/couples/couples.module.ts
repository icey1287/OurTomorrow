import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { CouplesController } from "./couples.controller";
import { CouplesService } from "./couples.service";

@Module({
  imports: [IdentityModule],
  controllers: [CouplesController],
  providers: [CouplesService],
})
export class CouplesModule {}
