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
  ApiCreatedResponse,
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
  CreatePlanDto,
  DeletePlanQueryDto,
  ListPlansQueryDto,
  PlanActionDto,
  UpdatePlanDto,
} from "./dto/plan.dto";
import type { PlanSummary } from "./plan.presentation";
import { PlansService } from "./plans.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("plans")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("plans")
export class PlansController {
  constructor(
    @Inject(PlansService)
    private readonly plans: PlansService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Plans in the current relationship space" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListPlansQueryDto)) query: ListPlansQueryDto,
  ): Promise<PlanSummary[]> {
    return this.plans.list(role, query);
  }

  @Post()
  @ApiCreatedResponse({ description: "Created draft plan" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreatePlanDto)) dto: CreatePlanDto,
  ): Promise<PlanSummary> {
    return this.plans.create(role, dto);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Plan detail" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
  ): Promise<PlanSummary> {
    return this.plans.get(role, planId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated plan" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Body(createValidationPipe(UpdatePlanDto)) dto: UpdatePlanDto,
  ): Promise<PlanSummary> {
    return this.plans.update(role, planId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Soft-deleted plan" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Query(createValidationPipe(DeletePlanQueryDto)) query: DeletePlanQueryDto,
  ): Promise<void> {
    return this.plans.remove(role, planId, query.version);
  }

  @Post(":id/schedule")
  @ApiOkResponse({ description: "Scheduled plan" })
  schedule(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Body(createValidationPipe(PlanActionDto)) dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.plans.schedule(role, planId, dto);
  }

  @Post(":id/start")
  @ApiOkResponse({ description: "Started plan" })
  start(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Body(createValidationPipe(PlanActionDto)) dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.plans.start(role, planId, dto);
  }

  @Post(":id/complete")
  @ApiOkResponse({ description: "Completed plan" })
  complete(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Body(createValidationPipe(PlanActionDto)) dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.plans.complete(role, planId, dto);
  }

  @Post(":id/cancel")
  @ApiOkResponse({ description: "Cancelled plan" })
  cancel(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) planId: string,
    @Body(createValidationPipe(PlanActionDto)) dto: PlanActionDto,
  ): Promise<PlanSummary> {
    return this.plans.cancel(role, planId, dto);
  }
}
