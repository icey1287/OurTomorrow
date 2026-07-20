import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const NOTE_ICONS = ["peony", "lily", "butterfly", "hearts"] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
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
}

export class MarkNoteViewedDto {
  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
