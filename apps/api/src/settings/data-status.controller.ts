import { Controller, Get, Inject } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import {
  DataStatusService,
  type DataStatusResponse,
} from "./data-status.service";

@ApiTags("settings")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("settings")
export class DataStatusController {
  constructor(
    @Inject(DataStatusService)
    private readonly dataStatus: DataStatusService,
  ) {}

  @Get("data-status")
  @ApiOkResponse({
    description:
      "Non-sensitive backup age, queue, storage, export, and recycle-bin capability status",
  })
  get(@CurrentIdentityRole() role: IdentityRole): Promise<DataStatusResponse> {
    return this.dataStatus.get(role);
  }
}
