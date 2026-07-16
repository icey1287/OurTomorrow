import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "./current-role.decorator";
import { IdentityResponseDto, SelectIdentityDto } from "./dto/identity.dto";
import type { IdentityRole } from "./identity.constants";
import { IdentityService, type IdentityResponse } from "./identity.service";

@ApiTags("identity")
@Controller("identity")
export class IdentityController {
  constructor(
    @Inject(IdentityService)
    private readonly identities: IdentityService,
  ) {}

  @Post("select")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: IdentityResponseDto })
  select(
    @Body(createValidationPipe(SelectIdentityDto)) dto: SelectIdentityDto,
  ): Promise<IdentityResponse> {
    return this.identities.select(dto.role);
  }

  @Get("me")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: IdentityResponseDto })
  current(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<IdentityResponse> {
    return this.identities.current(role);
  }
}
