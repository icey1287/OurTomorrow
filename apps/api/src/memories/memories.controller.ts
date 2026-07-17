import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { ListFirstTimesQueryDto } from "./dto/first-times-query.dto";
import {
  BindMemoryMediaDto,
  CreateMemoryCommentDto,
  CreateMemoryDto,
  ListMemoriesQueryDto,
  SubmitPerspectiveDto,
  UpdateMemoryDto,
  UpsertPerspectiveDto,
  VersionQueryDto,
} from "./dto/memory.dto";
import type {
  MemoryComment,
  MemoryDetail,
  MemoryPerspectiveView,
  MemoryRevision,
  ReactionSummary,
} from "./memory.presentation";
import { MemoriesService, type PaginatedMemories } from "./memories.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("memories")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("memories")
export class MemoriesController {
  constructor(
    @Inject(MemoriesService)
    private readonly memories: MemoriesService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Cursor-paginated memory timeline" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListMemoriesQueryDto))
    query: ListMemoriesQueryDto,
  ): Promise<PaginatedMemories> {
    return this.memories.list(role, query);
  }

  @Get("first-times")
  @ApiOkResponse({
    description: "Published past first-time memories for the current couple",
  })
  firstTimes(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListFirstTimesQueryDto))
    query: ListFirstTimesQueryDto,
  ): Promise<PaginatedMemories> {
    return this.memories.firstTimes(role, query);
  }

  @Post()
  @ApiOkResponse({ description: "Created memory detail" })
  async create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateMemoryDto)) dto: CreateMemoryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const memory = await this.memories.create(role, dto);
    this.setEtag(response, memory);
    return memory;
  }

  @Get(":id/revisions")
  @ApiOkResponse({ description: "Safe shared-field revision history" })
  revisions(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
  ): Promise<MemoryRevision[]> {
    return this.memories.revisions(role, memoryId);
  }

  @Put(":id/perspective")
  @ApiOkResponse({ description: "Current role's perspective" })
  upsertPerspective(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Body(createValidationPipe(UpsertPerspectiveDto))
    dto: UpsertPerspectiveDto,
  ): Promise<MemoryPerspectiveView> {
    return this.memories.upsertPerspective(role, memoryId, dto);
  }

  @Post(":id/perspective/submit")
  @ApiOkResponse({ description: "Submitted current role's perspective" })
  submitPerspective(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Body(createValidationPipe(SubmitPerspectiveDto))
    dto: SubmitPerspectiveDto,
  ): Promise<MemoryPerspectiveView> {
    return this.memories.submitPerspective(role, memoryId, dto);
  }

  @Post(":id/comments")
  @ApiOkResponse({ description: "Created memory comment" })
  addComment(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Body(createValidationPipe(CreateMemoryCommentDto))
    dto: CreateMemoryCommentDto,
  ): Promise<MemoryComment> {
    return this.memories.addComment(role, memoryId, dto);
  }

  @Delete(":id/comments/:commentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Comment soft deleted" })
  removeComment(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Param("commentId", uuidPipe) commentId: string,
  ): Promise<void> {
    return this.memories.removeComment(role, memoryId, commentId);
  }

  @Put(":id/reactions/:emoji")
  @ApiOkResponse({ description: "Current memory reaction summary" })
  addReaction(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Param("emoji") emoji: string,
  ): Promise<ReactionSummary[]> {
    return this.memories.addReaction(role, memoryId, emoji);
  }

  @Delete(":id/reactions/:emoji")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Reaction removed idempotently" })
  removeReaction(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Param("emoji") emoji: string,
  ): Promise<void> {
    return this.memories.removeReaction(role, memoryId, emoji);
  }

  @Post(":id/media")
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "Memory ETag; must agree with body.version when supplied",
  })
  @ApiOkResponse({ description: "Updated memory media collection" })
  async bindMedia(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Body(createValidationPipe(BindMemoryMediaDto)) dto: BindMemoryMediaDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const memory = await this.memories.bindMedia(role, memoryId, dto, ifMatch);
    this.setEtag(response, memory);
    return memory;
  }

  @Delete(":id/media/:mediaId")
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "Memory ETag; required unless query.version is supplied",
  })
  @ApiOkResponse({ description: "Memory after media was unbound" })
  async unbindMedia(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Param("mediaId", uuidPipe) mediaId: string,
    @Query(createValidationPipe(VersionQueryDto)) query: VersionQueryDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const memory = await this.memories.unbindMedia(
      role,
      memoryId,
      mediaId,
      query.version,
      ifMatch,
    );
    this.setEtag(response, memory);
    return memory;
  }

  @Get(":id")
  @ApiOkResponse({ description: "Memory detail visible to the current role" })
  async get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const memory = await this.memories.get(role, memoryId);
    this.setEtag(response, memory);
    return memory;
  }

  @Patch(":id")
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "Memory ETag; must agree with body.version when supplied",
  })
  @ApiOkResponse({ description: "Updated memory detail" })
  async update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Body(createValidationPipe(UpdateMemoryDto)) dto: UpdateMemoryDto,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MemoryDetail> {
    const memory = await this.memories.update(role, memoryId, dto, ifMatch);
    this.setEtag(response, memory);
    return memory;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "Optional memory ETag",
  })
  @ApiNoContentResponse({ description: "Memory soft deleted" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) memoryId: string,
    @Query(createValidationPipe(VersionQueryDto)) query: VersionQueryDto,
    @Headers("if-match") ifMatch: string | undefined,
  ): Promise<void> {
    return this.memories.remove(role, memoryId, query.version, ifMatch);
  }

  private setEtag(
    response: Response,
    memory: Pick<MemoryDetail, "id" | "version">,
  ): void {
    response.setHeader("ETag", this.memories.etag(memory.id, memory.version));
  }
}
