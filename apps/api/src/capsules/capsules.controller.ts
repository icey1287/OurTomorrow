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
import type { CapsuleDetail, CapsuleSummary } from "./capsule.presentation";
import { CapsulesService } from "./capsules.service";
import {
  CapsuleActionDto,
  CreateCapsuleDto,
  DeleteCapsuleQueryDto,
  UpdateCapsuleDto,
} from "./dto/capsule.dto";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("capsules")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("capsules")
export class CapsulesController {
  constructor(
    @Inject(CapsulesService)
    private readonly capsules: CapsulesService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: "Visible capsule metadata without locked body",
  })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<CapsuleSummary[]> {
    return this.capsules.list(role);
  }

  @Post()
  @ApiOkResponse({ description: "Created capsule draft" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateCapsuleDto)) dto: CreateCapsuleDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.create(role, dto);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Privacy-filtered capsule detail" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
  ): Promise<CapsuleDetail> {
    return this.capsules.get(role, capsuleId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated capsule draft" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(UpdateCapsuleDto)) dto: UpdateCapsuleDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.update(role, capsuleId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Capsule draft soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Query(createValidationPipe(DeleteCapsuleQueryDto))
    query: DeleteCapsuleQueryDto,
  ): Promise<void> {
    return this.capsules.remove(role, capsuleId, query.version);
  }

  @Post(":id/seal")
  @ApiOkResponse({ description: "Capsule sealed and immutably locked" })
  seal(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(CapsuleActionDto)) dto: CapsuleActionDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.seal(role, capsuleId, dto.version);
  }

  @Post(":id/mark-condition-met")
  @ApiOkResponse({ description: "Server-validated capsule condition met" })
  markConditionMet(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(CapsuleActionDto)) dto: CapsuleActionDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.markConditionMet(role, capsuleId, dto.version);
  }

  @Post(":id/confirm-open")
  @ApiOkResponse({ description: "Current member confirmed a joint opening" })
  confirmOpen(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(CapsuleActionDto)) dto: CapsuleActionDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.confirmOpen(role, capsuleId, dto.version);
  }

  @Post(":id/open")
  @ApiOkResponse({
    description: "Current member explicitly opened the capsule",
  })
  open(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) capsuleId: string,
    @Body(createValidationPipe(CapsuleActionDto)) dto: CapsuleActionDto,
  ): Promise<CapsuleDetail> {
    return this.capsules.open(role, capsuleId, dto.version);
  }
}
