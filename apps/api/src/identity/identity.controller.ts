import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  IdentityResponseDto,
  ResolveIdentityDto,
  SelectIdentityDto,
} from "./dto/identity.dto";
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

  @Post("resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: IdentityResponseDto })
  resolve(
    @Body(createValidationPipe(ResolveIdentityDto)) dto: ResolveIdentityDto,
  ): Promise<IdentityResponse> {
    return this.identities.selectByName(dto.name);
  }
}
