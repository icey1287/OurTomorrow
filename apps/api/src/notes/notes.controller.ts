import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { CreateNoteDto, MarkNoteViewedDto } from "./dto/note.dto";
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
  @ApiOkResponse({ description: "All notes exchanged by the couple" })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<NotesResponse> {
    return this.notes.list(role);
  }

  @Post()
  @ApiOkResponse({ description: "Created and sent note" })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateNoteDto)) dto: CreateNoteDto,
  ): Promise<NoteView> {
    return this.notes.create(role, dto);
  }

  @Post(":id/mark-viewed")
  @ApiOkResponse({ description: "Read note" })
  markViewed(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Body(createValidationPipe(MarkNoteViewedDto)) dto: MarkNoteViewedDto,
  ): Promise<NoteView> {
    return this.notes.markViewed(role, noteId, dto);
  }
}
