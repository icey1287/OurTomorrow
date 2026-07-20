import { Body, Controller, Inject, Patch } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
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
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("couples")
export class CouplesController {
  constructor(
    @Inject(CouplesService)
    private readonly couples: CouplesService,
  ) {}

  @Patch("current")
  @ApiOkResponse({ type: CoupleSummaryDto })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(UpdateCoupleDto)) dto: UpdateCoupleDto,
  ): Promise<CoupleSummary> {
    return this.couples.update(role, dto);
  }
}
