import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CurrentStatusKind } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class PutCurrentStatusDto {
  @ApiPropertyOptional({
    minimum: 1,
    description: "Version of the current status being replaced",
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ enum: CurrentStatusKind })
  @IsEnum(CurrentStatusKind)
  kind!: CurrentStatusKind;

  @ApiPropertyOptional({ maxLength: 280, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string | null;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mood?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scene?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  needsResponse?: boolean;

  @ApiProperty({
    format: "date-time",
    description: "Absolute expiry instant including a UTC offset",
  })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "expiresAt must include Z or an explicit UTC offset",
  })
  expiresAt!: string;
}

export class DeleteCurrentStatusQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
