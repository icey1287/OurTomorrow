import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UpdateCoupleDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  startDate?: string;

  @ApiPropertyOptional({ example: "Asia/Shanghai", maxLength: 64 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ maxLength: 280, nullable: true })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MaxLength(280)
  signature?: string | null;

  @ApiPropertyOptional({ enum: ["system", "light", "dark"] })
  @IsOptional()
  @IsIn(["system", "light", "dark"])
  theme?: "system" | "light" | "dark";
}
