import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UpdateCoupleDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ example: "2024-01-01" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @ApiPropertyOptional({ maxLength: 280, nullable: true })
  @Transform(({ value }) => (value === null ? null : trim(value)))
  @IsOptional()
  @IsString()
  @MaxLength(280)
  signature?: string | null;
}
