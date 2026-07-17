import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

function nullableTrim(value: unknown): unknown {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : value;
}

export class UpdateAnnualReviewDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  selectedMediaId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  message?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  nextYearLetter?: string | null;
}

export class PublishAnnualReviewDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
