import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
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
import { CreateExportDto } from "./dto/export.dto";
import type { ExportJobView } from "./export.presentation";
import { ExportsService } from "./exports.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("exports")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("exports")
export class ExportsController {
  constructor(
    @Inject(ExportsService)
    private readonly exportsService: ExportsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Exports requested by the current local role" })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<ExportJobView[]> {
    return this.exportsService.list(role);
  }

  @Post()
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true })
  @ApiCreatedResponse({ description: "Private export generated or replayed" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateExportDto)) dto: CreateExportDto,
    @Headers("idempotency-key") rawKey: string | undefined,
  ): Promise<ExportJobView> {
    return this.exportsService.create(role, dto, parseIdempotencyKey(rawKey));
  }

  @Get(":id")
  @ApiOkResponse({ description: "Export status without a permanent URL" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) exportId: string,
  ): Promise<ExportJobView> {
    return this.exportsService.get(role, exportId);
  }

  @Post(":id/download")
  @HttpCode(HttpStatus.OK)
  @ApiProduces("application/zip", "application/json")
  @ApiOkResponse({
    schema: { type: "string", format: "binary" },
    description: "Private export stream; no permanent download URL is issued",
  })
  async download(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) exportId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exportsService.download(role, exportId);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.contentLength));
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(file.stream);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Export package deleted immediately" })
  async remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) exportId: string,
  ): Promise<void> {
    await this.exportsService.remove(role, exportId);
  }
}
