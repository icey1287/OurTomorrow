import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import {
  CompleteUploadDto,
  MediaAssetSummaryDto,
  PresignUploadDto,
  UploadIntentDto,
} from "./dto/upload.dto";
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from "./idempotency-key";
import { MediaService } from "./media.service";

@ApiTags("uploads")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("uploads")
export class UploadsController {
  constructor(
    @Inject(MediaService)
    private readonly media: MediaService,
  ) {}

  @Post("presign")
  @ApiCreatedResponse({ type: UploadIntentDto })
  async presign(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(PresignUploadDto)) dto: PresignUploadDto,
  ): Promise<UploadIntentDto> {
    return this.media.presign(role, dto);
  }

  @Put(":id/content")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiConsumes(
    "application/octet-stream",
    "image/jpeg",
    "image/png",
    "image/webp",
  )
  @ApiBody({
    schema: { type: "string", format: "binary" },
    description: "Raw image bytes; this endpoint can be completed only once",
  })
  @ApiNoContentResponse({ description: "Upload bytes accepted" })
  async uploadContent(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", new ParseUUIDPipe({ version: "4" })) uploadId: string,
    @Req() request: Request,
    @Headers("content-length") contentLength: string | undefined,
    @Headers("content-type") contentType: string | undefined,
  ): Promise<void> {
    await this.media.receiveUpload(
      role,
      uploadId,
      request,
      contentLength,
      contentType,
    );
  }

  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    description: "Stable key reused only when retrying this upload completion",
  })
  @ApiOkResponse({ type: MediaAssetSummaryDto })
  async complete(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CompleteUploadDto)) dto: CompleteUploadDto,
    @Headers("idempotency-key") rawIdempotencyKey: string | undefined,
  ): Promise<MediaAssetSummaryDto> {
    return this.media.complete(
      role,
      dto.uploadId,
      parseIdempotencyKey(rawIdempotencyKey),
    );
  }
}
