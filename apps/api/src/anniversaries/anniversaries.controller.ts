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
import type {
  AnniversaryDetail,
  AnniversaryOccurrence,
  AnniversaryReminderView,
  AnniversarySummary,
} from "./anniversary.presentation";
import { AnniversariesService } from "./anniversaries.service";
import {
  CreateAnniversaryDto,
  CreateAnniversaryReminderDto,
  DeleteAnniversaryQueryDto,
  UpdateAnniversaryDto,
} from "./dto/anniversary.dto";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("anniversaries")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("anniversaries")
export class AnniversariesController {
  constructor(
    @Inject(AnniversariesService)
    private readonly anniversaries: AnniversariesService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: "Active important dates ordered by occurrence",
  })
  list(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<AnniversarySummary[]> {
    return this.anniversaries.list(role);
  }

  @Post()
  @ApiOkResponse({ description: "Created important date" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateAnniversaryDto)) dto: CreateAnniversaryDto,
  ): Promise<AnniversarySummary> {
    return this.anniversaries.create(role, dto);
  }

  @Get(":id/occurrences")
  @ApiOkResponse({
    description: "Past linked memories and planned occurrences",
  })
  occurrences(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
  ): Promise<AnniversaryOccurrence[]> {
    return this.anniversaries.occurrences(role, anniversaryId);
  }

  @Post(":id/reminders")
  @ApiOkResponse({ description: "Created or normalized reminder rule" })
  createReminder(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
    @Body(createValidationPipe(CreateAnniversaryReminderDto))
    dto: CreateAnniversaryReminderDto,
  ): Promise<AnniversaryReminderView> {
    return this.anniversaries.createReminder(role, anniversaryId, dto);
  }

  @Delete(":id/reminders/:reminderId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Reminder rule deleted" })
  removeReminder(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
    @Param("reminderId", uuidPipe) reminderId: string,
  ): Promise<void> {
    return this.anniversaries.removeReminder(role, anniversaryId, reminderId);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Important date detail" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
  ): Promise<AnniversaryDetail> {
    return this.anniversaries.get(role, anniversaryId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Optimistically updated important date" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
    @Body(createValidationPipe(UpdateAnniversaryDto)) dto: UpdateAnniversaryDto,
  ): Promise<AnniversarySummary> {
    return this.anniversaries.update(role, anniversaryId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Important date soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) anniversaryId: string,
    @Query(createValidationPipe(DeleteAnniversaryQueryDto))
    query: DeleteAnniversaryQueryDto,
  ): Promise<void> {
    return this.anniversaries.remove(role, anniversaryId, query.version);
  }
}
