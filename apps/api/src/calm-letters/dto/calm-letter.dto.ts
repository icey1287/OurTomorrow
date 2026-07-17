import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CalmLetterPurpose } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateCalmLetterDto {
  @ApiProperty({ enum: CalmLetterPurpose })
  @IsEnum(CalmLetterPurpose)
  purpose!: CalmLetterPurpose;

  @ApiProperty({ maxLength: 20_000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  content!: string;

  @ApiPropertyOptional({
    format: "date-time",
    nullable: true,
    description:
      "Server unlock instant with an explicit UTC offset. Null means available immediately.",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "unlockAt must include Z or an explicit UTC offset",
  })
  unlockAt?: string | null;
}

export class CalmLetterActionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
