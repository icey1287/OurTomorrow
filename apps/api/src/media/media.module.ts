import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { UploadsController } from "./uploads.controller";

@Module({
  controllers: [UploadsController, MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
