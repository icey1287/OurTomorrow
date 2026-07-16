import { Controller, Get, Inject } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { TodayResponseDto } from "./dto/today-response.dto";
import { TodayService, type TodayResponse } from "./today.service";

@ApiTags("today")
@Controller("today")
export class TodayController {
  constructor(@Inject(TodayService) private readonly today: TodayService) {}

  @Get()
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: TodayResponseDto })
  get(@CurrentIdentityRole() role: IdentityRole): Promise<TodayResponse> {
    return this.today.get(role);
  }
}
