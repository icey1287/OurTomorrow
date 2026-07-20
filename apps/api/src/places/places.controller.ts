import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import type { PlaceSearchResponse } from "./amap-place-search.service";
import { NearbyPlacesDto } from "./dto/place.dto";
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

  @Post("nearby")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Nearby Amap building suggestions" })
  nearby(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(NearbyPlacesDto)) dto: NearbyPlacesDto,
  ): Promise<PlaceSearchResponse> {
    return this.places.nearby(role, dto);
  }

  @Get("status/:id/map-preview")
  @ApiOkResponse({ description: "Private Amap map image for a status" })
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
}
