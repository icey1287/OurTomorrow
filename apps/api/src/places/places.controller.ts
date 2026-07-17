import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import type { PlaceSummary } from "../memories/memory.presentation";
import {
  CreatePlaceDto,
  DeletePlaceQueryDto,
  UpdatePlaceDto,
} from "./dto/place.dto";
import { PlacesService } from "./places.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("places")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("places")
export class PlacesController {
  constructor(
    @Inject(PlacesService)
    private readonly places: PlacesService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Active explicit places in the shared space" })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<PlaceSummary[]> {
    return this.places.list(role);
  }

  @Post()
  @ApiOkResponse({ description: "Created place" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreatePlaceDto)) dto: CreatePlaceDto,
  ): Promise<PlaceSummary> {
    return this.places.create(role, dto);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated place" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) placeId: string,
    @Body(createValidationPipe(UpdatePlaceDto)) dto: UpdatePlaceDto,
  ): Promise<PlaceSummary> {
    return this.places.update(role, placeId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Place soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) placeId: string,
    @Query(createValidationPipe(DeletePlaceQueryDto))
    query: DeletePlaceQueryDto,
  ): Promise<void> {
    return this.places.remove(role, placeId, query.version);
  }
}
