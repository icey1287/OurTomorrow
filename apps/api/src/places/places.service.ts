import { Inject, Injectable } from "@nestjs/common";
import { Clock } from "../common/clock/clock";
import { resourceNotFound } from "../common/http/api-exception";
import { PrismaService } from "../database/prisma.service";
import type { IdentityRole } from "../identity/identity.constants";
import { IdentityService } from "../identity/identity.service";
import type { NearbyPlacesDto } from "./dto/place.dto";
import {
  AmapPlaceSearchService,
  type PlaceSearchResponse,
  type StaticMapPreview,
} from "./amap-place-search.service";

@Injectable()
export class PlacesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(IdentityService)
    private readonly identities: IdentityService,
    @Inject(AmapPlaceSearchService)
    private readonly placeSearch: AmapPlaceSearchService,
    @Inject(Clock)
    private readonly clock: Clock,
  ) {}

  async nearby(
    role: IdentityRole,
    dto: NearbyPlacesDto,
  ): Promise<PlaceSearchResponse> {
    await this.identities.current(role);
    return this.placeSearch.nearby(dto.latitude, dto.longitude, {
      ...(dto.radius === undefined ? {} : { radius: dto.radius }),
      ...(dto.limit === undefined ? {} : { limit: dto.limit }),
    });
  }

  async statusMap(
    role: IdentityRole,
    statusId: string,
  ): Promise<StaticMapPreview> {
    const actor = await this.identities.current(role);
    const status = await this.prisma.currentStatus.findFirst({
      where: {
        id: statusId,
        coupleId: actor.couple.id,
        archivedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      select: { latitude: true, longitude: true },
    });
    if (!status || status.latitude === null || status.longitude === null) {
      throw resourceNotFound();
    }
    return this.placeSearch.staticMap(
      Number(status.latitude),
      Number(status.longitude),
    );
  }
}
