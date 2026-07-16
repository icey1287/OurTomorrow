import { Body, Controller, Inject, Patch } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { UserSummaryDto } from "../common/dto/relationship-response.dto";
import { createValidationPipe } from "../common/http/validation";
import type { UserSummary } from "../common/presentation/relationship";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Patch("me")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: UserSummaryDto })
  updateMe(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(UpdateProfileDto)) dto: UpdateProfileDto,
  ): Promise<UserSummary> {
    return this.users.updateMe(role, dto);
  }
}
