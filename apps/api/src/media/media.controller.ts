import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { MediaService } from "./media.service";

@ApiTags("media")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("media")
export class MediaController {
  constructor(
    @Inject(MediaService)
    private readonly media: MediaService,
  ) {}

  @Get(":id/thumbnail")
  @ApiProduces("image/webp")
  @ApiOkResponse({
    schema: { type: "string", format: "binary" },
    description: "Private re-encoded thumbnail",
  })
  async thumbnail(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", new ParseUUIDPipe({ version: "4" })) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.stream(role, mediaId, true, response);
  }

  @Get(":id")
  @ApiProduces("image/jpeg", "image/webp")
  @ApiOkResponse({
    schema: { type: "string", format: "binary" },
    description: "Private re-encoded image",
  })
  async original(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", new ParseUUIDPipe({ version: "4" })) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.stream(role, mediaId, false, response);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Media soft-deleted" })
  async remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", new ParseUUIDPipe({ version: "4" })) mediaId: string,
  ): Promise<void> {
    await this.media.remove(role, mediaId);
  }

  private async stream(
    role: IdentityRole,
    mediaId: string,
    thumbnail: boolean,
    response: Response,
  ): Promise<StreamableFile> {
    const file = await this.media.open(role, mediaId, thumbnail);
    response.setHeader("ETag", file.etag);
    response.setHeader("Last-Modified", file.lastModified);
    response.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(file.stream, file.options);
  }
}
