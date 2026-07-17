import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import type { MemoryCardSummary } from "../memories/memory.presentation";
import { createValidationPipe } from "../common/http/validation";
import { RandomMemoryQueryDto } from "./dto/random-memory-query.dto";
import {
  TodayResponseDto,
  TodayUpcomingResponseDto,
} from "./dto/today-response.dto";
import { UpcomingQueryDto } from "./dto/upcoming-query.dto";
import {
  TodayService,
  type TodayResponse,
  type TodayUpcomingResponse,
} from "./today.service";

@ApiTags("today")
@Controller("today")
export class TodayController {
  constructor(@Inject(TodayService) private readonly today: TodayService) {}

  @Get()
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: TodayResponseDto })
  get(@CurrentIdentityRole() role: IdentityRole): Promise<TodayResponse> {
    return this.today.get(role);
  }

  @Get("random-memory")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ description: "A deduplicated safe memory card or null" })
  randomMemory(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(RandomMemoryQueryDto))
    query: RandomMemoryQueryDto,
  ): Promise<MemoryCardSummary | null> {
    return this.today.randomMemory(role, query.excludeId);
  }

  @Get("upcoming")
  @ApiHeader({
    name: IDENTITY_ROLE_HEADER,
    enum: ["boy", "girl"],
    required: true,
  })
  @ApiOkResponse({ type: TodayUpcomingResponseDto })
  upcoming(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(UpcomingQueryDto)) query: UpcomingQueryDto,
  ): Promise<TodayUpcomingResponse> {
    return this.today.upcoming(role, query.days);
  }
}
