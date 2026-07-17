import { Module } from "@nestjs/common";
import { MemoriesModule } from "../memories/memories.module";
import { ConversionsController } from "./conversions.controller";
import { ConversionsService } from "./conversions.service";

@Module({
  imports: [MemoriesModule],
  controllers: [ConversionsController],
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class ConversionsModule {}
