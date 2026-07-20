import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const NOTE_ICONS = ["peony", "lily", "butterfly", "hearts"] as const;
const NOTE_IMAGE_MAX_BASE64_CHARACTERS = 2_000_000;
export const NOTE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type NoteImageMimeType = (typeof NOTE_IMAGE_MIME_TYPES)[number];

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateNoteImageDto {
  @ApiProperty({ enum: NOTE_IMAGE_MIME_TYPES })
  @IsIn(NOTE_IMAGE_MIME_TYPES)
  mimeType!: NoteImageMimeType;

  @ApiProperty({ maxLength: NOTE_IMAGE_MAX_BASE64_CHARACTERS })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(NOTE_IMAGE_MAX_BASE64_CHARACTERS)
  dataBase64!: string;
}

export class CreateNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 4_000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  content!: string;

  @ApiPropertyOptional({ enum: NOTE_ICONS, nullable: true })
  @IsOptional()
  @IsIn(NOTE_ICONS)
  icon?: (typeof NOTE_ICONS)[number] | null;

  @ApiPropertyOptional({ type: () => CreateNoteImageDto, nullable: true })
  @Type(() => CreateNoteImageDto)
  @IsOptional()
  @ValidateNested()
  image?: CreateNoteImageDto | null;
}

export class MarkNoteViewedDto {
  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
