import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const CURRENT_STATUS_KINDS = [
  "HAPPY",
  "BUSY",
  "COMMUTING",
  "HOME",
  "RESTING",
  "MISS_YOU",
] as const;

export type CurrentStatusKind = (typeof CURRENT_STATUS_KINDS)[number];

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class PutCurrentStatusDto {
  @ApiProperty({ enum: CURRENT_STATUS_KINDS })
  @IsIn(CURRENT_STATUS_KINDS)
  kind!: CurrentStatusKind;

  @ApiPropertyOptional({ maxLength: 280, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string | null;

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  location!: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  locationAddress?: string | null;

  @ApiPropertyOptional({ minimum: -90, maximum: 90, nullable: true })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ minimum: -180, maximum: 180, nullable: true })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ format: "date-time" })
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "expiresAt must include Z or an explicit UTC offset",
  })
  expiresAt!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class DeleteCurrentStatusQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
