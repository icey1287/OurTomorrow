import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { MemoryResurfaceService } from "./memory-resurface.service";
import { MemoryResurfacesController } from "./memory-resurfaces.controller";
import { MemoriesController } from "./memories.controller";
import { MemoryCreationService } from "./memory-creation.service";
import { MemoriesService } from "./memories.service";

@Module({
  imports: [IdentityModule],
  controllers: [MemoriesController, MemoryResurfacesController],
  providers: [MemoriesService, MemoryResurfaceService, MemoryCreationService],
  exports: [MemoriesService, MemoryResurfaceService, MemoryCreationService],
})
export class MemoriesModule {}
