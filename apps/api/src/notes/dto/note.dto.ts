import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const NOTE_TYPES = [
  "LOVE",
  "REMINDER",
  "THANKS",
  "APOLOGY",
  "TALK_LATER",
  "DO_TOGETHER",
  "SURPRISE",
] as const;

export const NOTE_SCOPES = ["all", "sent", "received"] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

function optionalBoolean(value: unknown): unknown {
  if (value === undefined || typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

class NoteFieldsDto {
  @ApiProperty({ enum: NOTE_TYPES })
  @IsIn(NOTE_TYPES)
  type!: (typeof NOTE_TYPES)[number];

  @ApiProperty({ minLength: 1, maxLength: 4_000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  content!: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  keepAfterViewed?: boolean;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "showAt must include Z or an explicit UTC offset",
  })
  showAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "expiresAt must include Z or an explicit UTC offset",
  })
  expiresAt?: string | null;
}

export class CreateNoteDto extends NoteFieldsDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateNoteDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ enum: NOTE_TYPES })
  @IsOptional()
  @IsIn(NOTE_TYPES)
  type?: (typeof NOTE_TYPES)[number];

  @ApiPropertyOptional({ minLength: 1, maxLength: 4_000 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  content?: string;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  keepAfterViewed?: boolean;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "showAt must include Z or an explicit UTC offset",
  })
  showAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "expiresAt must include Z or an explicit UTC offset",
  })
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class ListNotesQueryDto {
  @ApiPropertyOptional({ enum: NOTE_SCOPES, default: "all" })
  @IsOptional()
  @IsIn(NOTE_SCOPES)
  scope?: (typeof NOTE_SCOPES)[number];

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }) => optionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;
}

export class DeleteNoteQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class MarkNoteViewedDto {
  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class NoteReactionDto {
  @ApiProperty({ minLength: 1, maxLength: 32 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji!: string;
}

export class NoteOrderItemDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  id!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ minimum: 0, maximum: 10_000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  position!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class ReorderNotesDto {
  @ApiProperty({ type: [NoteOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NoteOrderItemDto)
  items!: NoteOrderItemDto[];
}
