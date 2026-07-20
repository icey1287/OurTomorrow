import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AmapPlaceSearchService } from "./amap-place-search.service";
import { PlacesController } from "./places.controller";
import { PlacesService } from "./places.service";

@Module({
  imports: [IdentityModule],
  controllers: [PlacesController],
  providers: [AmapPlaceSearchService, PlacesService],
})
export class PlacesModule {}
