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
  DeleteTodayMoodQueryDto,
  ListMoodsQueryDto,
  PutTodayMoodDto,
} from "./dto/mood.dto";
import type { MonthlyMoodsResponse, MoodEntryView } from "./mood.presentation";
import { MoodsService } from "./moods.service";

@ApiTags("moods")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("moods")
export class MoodsController {
  constructor(
    @Inject(MoodsService)
    private readonly moods: MoodsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Monthly mood entries visible to the caller" })
  listMonth(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListMoodsQueryDto)) query: ListMoodsQueryDto,
  ): Promise<MonthlyMoodsResponse> {
    return this.moods.listMonth(role, query.month);
  }

  @Put("today")
  @ApiOkResponse({ description: "Today's mood entry for the caller" })
  putToday(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(PutTodayMoodDto)) dto: PutTodayMoodDto,
  ): Promise<MoodEntryView> {
    return this.moods.putToday(role, dto);
  }

  @Delete("today")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Today's mood entry deleted" })
  removeToday(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(DeleteTodayMoodQueryDto))
    query: DeleteTodayMoodQueryDto,
  ): Promise<void> {
    return this.moods.removeToday(role, query.version);
  }
}
