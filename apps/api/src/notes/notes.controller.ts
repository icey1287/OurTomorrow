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
import type { ReactionSummary } from "../memories/memory.presentation";
import {
  CreateNoteDto,
  DeleteNoteQueryDto,
  ListNotesQueryDto,
  MarkNoteViewedDto,
  NoteReactionDto,
  ReorderNotesDto,
  UpdateNoteDto,
} from "./dto/note.dto";
import type { NoteView } from "./note.presentation";
import { NotesService, type NotesResponse } from "./notes.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("notes")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("notes")
export class NotesController {
  constructor(
    @Inject(NotesService)
    private readonly notes: NotesService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Notes visible to the selected identity" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListNotesQueryDto)) query: ListNotesQueryDto,
  ): Promise<NotesResponse> {
    return this.notes.list(role, query);
  }

  @Post()
  @ApiOkResponse({ description: "Created note" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateNoteDto)) dto: CreateNoteDto,
  ): Promise<NoteView> {
    return this.notes.create(role, dto);
  }

  @Put("order")
  @ApiOkResponse({ description: "Updated shared note order" })
  reorder(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(ReorderNotesDto)) dto: ReorderNotesDto,
  ): Promise<NotesResponse> {
    return this.notes.reorder(role, dto);
  }

  @Get(":id")
  @ApiOkResponse({ description: "Note detail or a scheduled placeholder" })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
  ): Promise<NoteView> {
    return this.notes.get(role, noteId);
  }

  @Patch(":id")
  @ApiOkResponse({ description: "Updated undisplayed authored note" })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(UpdateNoteDto)) dto: UpdateNoteDto,
  ): Promise<NoteView> {
    return this.notes.update(role, noteId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: "Note deleted or archived" })
  remove(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Query(createValidationPipe(DeleteNoteQueryDto)) query: DeleteNoteQueryDto,
  ): Promise<void> {
    return this.notes.remove(role, noteId, query.version);
  }

  @Post(":id/mark-viewed")
  @ApiOkResponse({ description: "Viewed note state" })
  markViewed(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(MarkNoteViewedDto)) dto: MarkNoteViewedDto,
  ): Promise<NoteView> {
    return this.notes.markViewed(role, noteId, dto);
  }

  @Put(":id/reaction")
  @ApiOkResponse({ description: "Current note reaction summary" })
  addReaction(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(NoteReactionDto)) dto: NoteReactionDto,
  ): Promise<ReactionSummary[]> {
    return this.notes.addReaction(role, noteId, dto);
  }

  @Delete(":id/reaction")
  @ApiOkResponse({ description: "Current note reaction summary" })
  removeReaction(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(NoteReactionDto)) dto: NoteReactionDto,
  ): Promise<ReactionSummary[]> {
    return this.notes.removeReaction(role, noteId, dto);
  }
}
