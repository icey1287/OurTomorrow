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
import type { TagSummary } from "../memories/memory.presentation";
import { CreateTagDto, DeleteTagQueryDto, UpdateTagDto } from "./dto/tag.dto";
import { TagsService } from "./tags.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("tags")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("tags")
export class TagsController {
  constructor(
    @Inject(TagsService)
    private readonly tags: TagsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Active tags in the shared space" })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<TagSummary[]> {
    return this.tags.list(role);
  }

  @Post()
  @ApiOkResponse({ description: "Created or restored tag" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateTagDto)) dto: CreateTagDto,
  ): Promise<TagSummary> {
    return this.tags.create(role, dto);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated tag" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) tagId: string,
    @Body(createValidationPipe(UpdateTagDto)) dto: UpdateTagDto,
  ): Promise<TagSummary> {
    return this.tags.update(role, tagId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Tag soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) tagId: string,
    @Query(createValidationPipe(DeleteTagQueryDto)) query: DeleteTagQueryDto,
  ): Promise<void> {
    return this.tags.remove(role, tagId, query.version);
  }
}
