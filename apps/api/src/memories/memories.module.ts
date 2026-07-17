import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MemoryResurfaceService } from "./memory-resurface.service";
import { MemoriesController } from "./memories.controller";
import { MemoryCreationService } from "./memory-creation.service";
import { MemoriesService } from "./memories.service";

@Module({
  imports: [IdentityModule],
  controllers: [MemoriesController],
  providers: [MemoriesService, MemoryResurfaceService, MemoryCreationService],
  exports: [MemoriesService, MemoryResurfaceService, MemoryCreationService],
})
export class MemoriesModule {}
