import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import {
  AddDailyEntryPostscriptDto,
  DailyEntryCalendarQueryDto,
  DailyEntryDateParamsDto,
  SaveDailyEntryDto,
  SubmitDailyEntryDto,
} from "./dto/daily-entry.dto";
import {
  DailyEntriesService,
  type DailyEntryCalendar,
  type DailyEntryDetail,
} from "./daily-entries.service";

@ApiTags("daily-entries")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("daily-entries")
export class DailyEntriesController {
  constructor(
    @Inject(DailyEntriesService)
    private readonly dailyEntries: DailyEntriesService,
  ) {}

  @Get("today")
  @ApiOkResponse({ description: "Today's prompt and reveal-safe entry state" })
  today(@CurrentIdentityRole() role: IdentityRole): Promise<DailyEntryDetail> {
    return this.dailyEntries.today(role);
  }

  @Put("today")
  @ApiOkResponse({ description: "Saved current identity's private draft" })
  saveToday(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(SaveDailyEntryDto)) dto: SaveDailyEntryDto,
  ): Promise<DailyEntryDetail> {
    return this.dailyEntries.saveToday(role, dto);
  }

  @Post("today/submit")
  @ApiOkResponse({
    description: "Submitted answer, atomically revealing both when complete",
  })
  submitToday(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(SubmitDailyEntryDto)) dto: SubmitDailyEntryDto,
  ): Promise<DailyEntryDetail> {
    return this.dailyEntries.submitToday(role, dto);
  }

  @Post("today/postscript")
  @ApiOkResponse({
    description: "Updated current identity's revealed postscript",
  })
  addPostscript(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(AddDailyEntryPostscriptDto))
    dto: AddDailyEntryPostscriptDto,
  ): Promise<DailyEntryDetail> {
    return this.dailyEntries.addPostscript(role, dto);
  }

  @Get("calendar")
  @ApiOkResponse({ description: "Body-free monthly completion states" })
  calendar(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(DailyEntryCalendarQueryDto))
    query: DailyEntryCalendarQueryDto,
  ): Promise<DailyEntryCalendar> {
    return this.dailyEntries.calendar(role, query.month);
  }

  @Get(":date")
  @ApiOkResponse({ description: "Reveal-safe entry detail for a local date" })
  byDate(
    @CurrentIdentityRole() role: IdentityRole,
    @Param(createValidationPipe(DailyEntryDateParamsDto))
    params: DailyEntryDateParamsDto,
  ): Promise<DailyEntryDetail> {
    return this.dailyEntries.byDate(role, params.date);
  }
}
