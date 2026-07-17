import { Module } from "@nestjs/common";
import { AuditModule } from "../common/audit/audit.module";
import { MemoriesModule } from "../memories/memories.module";
import { ConversionsController } from "./conversions.controller";
import { ConversionsService } from "./conversions.service";

@Module({
  imports: [AuditModule, MemoriesModule],
  controllers: [ConversionsController],
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
