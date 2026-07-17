import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
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

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class PutTodayMoodDto {
  @ApiPropertyOptional({
    minimum: 1,
    description: "Version of today's existing mood entry",
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  mood!: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visibleToPartner?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  wantsResponse?: boolean;
}

export class ListMoodsQueryDto {
  @ApiProperty({ example: "2026-07", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" })
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "month must use YYYY-MM",
  })
  month!: string;
}

export class DeleteTodayMoodQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
