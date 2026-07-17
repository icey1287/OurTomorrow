import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import {
  MemoryResurfaceService,
  type MemoryResurfaceTodayResponse,
  type MemoryResurfaceView,
} from "./memory-resurface.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("memory-resurfaces")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("memory-resurfaces")
export class MemoryResurfacesController {
  constructor(
    @Inject(MemoryResurfaceService)
    private readonly resurfaces: MemoryResurfaceService,
  ) {}

  @Get("today")
  @ApiOkResponse({
    description: "Today's couple-local blind box without unopened memory data",
  })
  today(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<MemoryResurfaceTodayResponse> {
    return this.resurfaces.today(role);
  }

  @Post(":id/open")
  @ApiOkResponse({ description: "Explicitly opened today's blind box" })
  open(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) resurfaceId: string,
  ): Promise<MemoryResurfaceView> {
    return this.resurfaces.open(role, resurfaceId);
  }

  @Post(":id/dismiss")
  @ApiOkResponse({ description: "Dismissed today's blind box idempotently" })
  dismiss(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) resurfaceId: string,
  ): Promise<MemoryResurfaceView> {
    return this.resurfaces.dismiss(role, resurfaceId);
  }
}
