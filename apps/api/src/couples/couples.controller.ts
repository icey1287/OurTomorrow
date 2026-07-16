import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Patch,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CoupleSummaryDto } from "../common/dto/relationship-response.dto";
import { createValidationPipe } from "../common/http/validation";
import type { CoupleSummary } from "../common/presentation/relationship";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { CouplesService } from "./couples.service";
import { UpdateCoupleDto } from "./dto/couple.dto";

@ApiTags("couples")
@Controller("couples")
export class CouplesController {
  constructor(
    @Inject(CouplesService)
    private readonly couples: CouplesService,
  ) {}

  @Get("current")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: CoupleSummaryDto })
  async current(
    @CurrentIdentityRole() role: IdentityRole,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CoupleSummary> {
    const couple = await this.couples.current(role);
    response.setHeader("ETag", this.couples.etag(couple.id, couple.version));
    return couple;
  }

  @Patch("current")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "Optional ETag; body version remains required",
  })
  @ApiOkResponse({ type: CoupleSummaryDto })
  async update(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(UpdateCoupleDto)) dto: UpdateCoupleDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CoupleSummary> {
    const couple = await this.couples.update(role, dto, ifMatch);
    response.setHeader("ETag", this.couples.etag(couple.id, couple.version));
    return couple;
  }
}
