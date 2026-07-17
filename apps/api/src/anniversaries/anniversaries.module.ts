import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AnniversariesController } from "./anniversaries.controller";
import { AnniversariesService } from "./anniversaries.service";

@Module({
  imports: [IdentityModule],
  controllers: [AnniversariesController],
  providers: [AnniversariesService],
  exports: [AnniversariesService],
})
export class AnniversariesModule {}
