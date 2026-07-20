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
  Res,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
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
  NearbyPlacesDto,
  PlaceSearchQueryDto,
  UpdatePlaceDto,
  UpdatePlaceStatusDto,
} from "./dto/place.dto";
import type { PlaceSearchResponse } from "./amap-place-search.service";
import { type PlaceMapResponse, PlacesService } from "./places.service";

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

  @Get("search")
  @ApiOkResponse({ description: "Amap place search suggestions" })
  search(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(PlaceSearchQueryDto))
    query: PlaceSearchQueryDto,
  ): Promise<PlaceSearchResponse> {
    return this.places.search(role, query);
  }

  @Post("nearby")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Nearby Amap POI suggestions" })
  nearby(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(NearbyPlacesDto)) dto: NearbyPlacesDto,
  ): Promise<PlaceSearchResponse> {
    return this.places.nearby(role, dto);
  }

  @Get("status/:id/map-preview")
  @ApiOkResponse({
    description: "Private Amap static map for a current status",
  })
  async statusMap(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) statusId: string,
    @Res() response: Response,
  ): Promise<void> {
    const preview = await this.places.statusMap(role, statusId);
    response.setHeader("Content-Type", preview.contentType);
    response.setHeader("Cache-Control", "private, max-age=300");
    response.send(preview.body);
  }

  @Get("map")
  @ApiOkResponse({
    description: "Relationship-scoped footprint and future-map projection",
  })
  map(@CurrentIdentityRole() role: IdentityRole): Promise<PlaceMapResponse> {
    return this.places.map(role);
  }

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

  @Patch(":id/status")
  @ApiOkResponse({ description: "Updated dual-axis place status" })
  updateStatus(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) placeId: string,
    @Body(createValidationPipe(UpdatePlaceStatusDto)) dto: UpdatePlaceStatusDto,
  ): Promise<PlaceSummary> {
    return this.places.updateStatus(role, placeId, dto);
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
