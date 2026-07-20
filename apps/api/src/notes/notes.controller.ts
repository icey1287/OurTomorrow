import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
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

  @Get(":id/image")
  @ApiProduces("image/jpeg", "image/png", "image/webp")
  @ApiOkResponse({ description: "Image attached to a note" })
  async image(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) noteId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const image = await this.notes.image(role, noteId);
    response.setHeader("Content-Type", image.mimeType);
    response.setHeader("Content-Length", String(image.sizeBytes));
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    return new StreamableFile(image.data);
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
