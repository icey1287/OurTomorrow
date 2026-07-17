import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import {
  DeleteCurrentStatusQueryDto,
  PutCurrentStatusDto,
} from "./dto/status.dto";
import type {
  CurrentStatusesResponse,
  CurrentStatusView,
} from "./status.presentation";
import { StatusesService } from "./statuses.service";

@ApiTags("statuses")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("statuses")
export class StatusesController {
  constructor(
    @Inject(StatusesService)
    private readonly statuses: StatusesService,
  ) {}

  @Get("current")
  @ApiOkResponse({ description: "Current unexpired status for both members" })
  current(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<CurrentStatusesResponse> {
    return this.statuses.current(role);
  }

  @Put("me")
  @ApiOkResponse({ description: "The caller's new current status" })
  putMine(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(PutCurrentStatusDto)) dto: PutCurrentStatusDto,
  ): Promise<CurrentStatusView> {
    return this.statuses.putMine(role, dto);
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Current status ended early" })
  removeMine(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(DeleteCurrentStatusQueryDto))
    query: DeleteCurrentStatusQueryDto,
  ): Promise<void> {
    return this.statuses.removeMine(role, query.version);
  }
}
