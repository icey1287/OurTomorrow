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
import {
  CompleteWishDto,
  CreateWishDto,
  CreateWishUpdateDto,
  DeleteWishQueryDto,
  ListWishesQueryDto,
  ReopenWishDto,
  UpdateWishDto,
  WishActionDto,
  WishPlanDto,
} from "./dto/wish.dto";
import type { WishDetail, WishUpdateView } from "./wish.presentation";
import { WishesService, type PaginatedWishes } from "./wishes.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("wishes")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("wishes")
export class WishesController {
  constructor(
    @Inject(WishesService)
    private readonly wishes: WishesService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Cursor-paginated shared wishes" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListWishesQueryDto))
    query: ListWishesQueryDto,
  ): Promise<PaginatedWishes> {
    return this.wishes.list(role, query);
  }

  @Post()
  @ApiOkResponse({ description: "Created wish" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateWishDto)) dto: CreateWishDto,
  ): Promise<WishDetail> {
    return this.wishes.create(role, dto);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Wish detail and update history" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
  ): Promise<WishDetail> {
    return this.wishes.get(role, wishId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated wish" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(UpdateWishDto)) dto: UpdateWishDto,
  ): Promise<WishDetail> {
    return this.wishes.update(role, wishId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Wish soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Query(createValidationPipe(DeleteWishQueryDto))
    query: DeleteWishQueryDto,
  ): Promise<void> {
    return this.wishes.remove(role, wishId, query.version);
  }

  @Post(":id/plan")
  @ApiOkResponse({ description: "Wish advanced from idea to planned" })
  plan(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(WishPlanDto)) dto: WishPlanDto,
  ): Promise<WishDetail> {
    return this.wishes.plan(role, wishId, dto);
  }

  @Post(":id/start")
  @ApiOkResponse({ description: "Wish and its plan started atomically" })
  start(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(WishActionDto)) dto: WishActionDto,
  ): Promise<WishDetail> {
    return this.wishes.start(role, wishId, dto.version);
  }

  @Post(":id/complete")
  @ApiOkResponse({ description: "Wish completed with reflection and media" })
  complete(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(CompleteWishDto)) dto: CompleteWishDto,
  ): Promise<WishDetail> {
    return this.wishes.complete(role, wishId, dto);
  }

  @Post(":id/reopen")
  @ApiOkResponse({ description: "Completed wish reopened to in progress" })
  reopen(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(ReopenWishDto)) dto: ReopenWishDto,
  ): Promise<WishDetail> {
    return this.wishes.reopen(role, wishId, dto);
  }

  @Post(":id/updates")
  @ApiOkResponse({ description: "A lightweight shared wish update" })
  addUpdate(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) wishId: string,
    @Body(createValidationPipe(CreateWishUpdateDto))
    dto: CreateWishUpdateDto,
  ): Promise<WishUpdateView> {
    return this.wishes.addUpdate(role, wishId, dto);
  }
}
