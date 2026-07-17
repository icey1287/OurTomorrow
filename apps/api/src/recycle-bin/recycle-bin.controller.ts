import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { ListRecycleBinQueryDto } from "./dto/recycle-bin.dto";
import {
  RecycleBinService,
  type PaginatedRecycleBinItems,
  type RecycleBinRestoreResult,
} from "./recycle-bin.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("recycle-bin")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("recycle-bin")
export class RecycleBinController {
  constructor(
    @Inject(RecycleBinService)
    private readonly recycleBin: RecycleBinService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Cursor-paginated recoverable items" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListRecycleBinQueryDto))
    query: ListRecycleBinQueryDto,
  ): Promise<PaginatedRecycleBinItems> {
    return this.recycleBin.list(role, query);
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Restored resource identity" })
  restore(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) itemId: string,
  ): Promise<RecycleBinRestoreResult> {
    return this.recycleBin.restore(role, itemId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: "Permanent deletion requested for the retention deadline",
  })
  requestPurge(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) itemId: string,
  ): Promise<void> {
    return this.recycleBin.requestPurge(role, itemId);
  }
}
