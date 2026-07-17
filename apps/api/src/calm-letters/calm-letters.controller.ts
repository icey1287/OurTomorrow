import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import type {
  CalmLetterDetail,
  CalmLetterSummary,
} from "./calm-letter.presentation";
import { CalmLettersService } from "./calm-letters.service";
import {
  CalmLetterActionDto,
  CreateCalmLetterDto,
} from "./dto/calm-letter.dto";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("calm-letters")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("calm-letters")
export class CalmLettersController {
  constructor(
    @Inject(CalmLettersService)
    private readonly calmLetters: CalmLettersService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Metadata-only calm letter list" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<CalmLetterSummary[]> {
    return this.calmLetters.list(role);
  }

  @Get(":id")
  @ApiOkResponse({
    description:
      "Body is included only for the author or a recipient who explicitly opened it",
  })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) calmLetterId: string,
  ): Promise<CalmLetterDetail> {
    return this.calmLetters.get(role, calmLetterId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: "A locked or immediately available calm letter",
  })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateCalmLetterDto)) dto: CreateCalmLetterDto,
  ): Promise<CalmLetterDetail> {
    return this.calmLetters.create(role, dto);
  }

  @Post(":id/open")
  @ApiOkResponse({
    description: "The recipient explicitly opened the available letter",
  })
  @ApiResponse({
    status: HttpStatus.LOCKED,
    description: "The server-side unlock instant has not arrived",
  })
  open(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) calmLetterId: string,
    @Body(createValidationPipe(CalmLetterActionDto)) dto: CalmLetterActionDto,
  ): Promise<CalmLetterDetail> {
    return this.calmLetters.open(role, calmLetterId, dto);
  }
}
