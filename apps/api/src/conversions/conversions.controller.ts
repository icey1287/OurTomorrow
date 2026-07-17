import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { createValidationPipe } from "../common/http/validation";
import {
  IDEMPOTENCY_KEY_HEADER,
  parseIdempotencyKey,
} from "../common/idempotency/idempotency-key";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import type { MemoryDetail } from "../memories/memory.presentation";
import type { ConversionResult } from "./conversion.presentation";
import { ConversionsService } from "./conversions.service";
import {
  ConvertCapsuleToMemoryDto,
  ConvertNoteDto,
  ConvertWishToMemoryDto,
} from "./dto/conversion.dto";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("conversions")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller()
export class ConversionsController {
  constructor(
    @Inject(ConversionsService)
    private readonly conversions: ConversionsService,
  ) {}

  @Post("notes/:id/convert")
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiOkResponse({ description: "Converted note target reference" })
  async convertNote(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(ConvertNoteDto)) dto: ConvertNoteDto,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ConversionResult> {
    const result = await this.conversions.convertNote(
      role,
      noteId,
      dto,
      parseIdempotencyKey(rawKey),
    );
    response.status(result.status);
    return result.result;
  }

  @Post("wishes/:id/convert-to-memory")
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiOkResponse({ description: "Converted memory" })
  async convertWish(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(ConvertWishToMemoryDto))
    dto: ConvertWishToMemoryDto,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const result = await this.conversions.convertWishToMemory(
      role,
      wishId,
      dto,
      parseIdempotencyKey(rawKey),
    );
    response.status(result.status);
    return result.memory;
  }

  @Post("capsules/:id/convert-to-memory")
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiOkResponse({ description: "Converted capsule memory" })
  async convertCapsule(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(ConvertCapsuleToMemoryDto))
    dto: ConvertCapsuleToMemoryDto,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const result = await this.conversions.convertCapsuleToMemory(
      role,
      capsuleId,
      dto,
      parseIdempotencyKey(rawKey),
    );
    response.status(result.status);
    return result.memory;
  }
}
