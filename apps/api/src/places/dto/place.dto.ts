import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";

export const PLACE_STATUSES = [
  "VISITED",
  "LIVED",
  "FIRST_TIME",
  "WANT_TO_GO",
  "PLANNED",
  "DEPARTING",
  "COMPLETED",
] as const;

export const PLACE_HISTORY_STATES = ["UNVISITED", "VISITED", "LIVED"] as const;

export const PLACE_FUTURE_STATES = [
  "NONE",
  "WANT_TO_GO",
  "PLANNED",
  "DEPARTING",
  "COMPLETED",
] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class CreatePlaceDto {
  @ApiProperty({ maxLength: 160 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

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

  @ApiPropertyOptional({ enum: PLACE_STATUSES })
  @IsOptional()
  @IsIn(PLACE_STATUSES)
  status?: (typeof PLACE_STATUSES)[number];

  @ApiPropertyOptional({ enum: PLACE_HISTORY_STATES })
  @IsOptional()
  @IsIn(PLACE_HISTORY_STATES)
  historyState?: (typeof PLACE_HISTORY_STATES)[number];

  @ApiPropertyOptional({ enum: PLACE_FUTURE_STATES })
  @IsOptional()
  @IsIn(PLACE_FUTURE_STATES)
  futureState?: (typeof PLACE_FUTURE_STATES)[number];

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "firstVisitedAt must include Z or an explicit UTC offset",
  })
  firstVisitedAt?: string | null;
}

export class UpdatePlaceDto extends PartialType(CreatePlaceDto) {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class DeletePlaceQueryDto {
  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class UpdatePlaceStatusDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ enum: PLACE_HISTORY_STATES })
  @IsOptional()
  @IsIn(PLACE_HISTORY_STATES)
  historyState?: (typeof PLACE_HISTORY_STATES)[number];

  @ApiPropertyOptional({ enum: PLACE_FUTURE_STATES })
  @IsOptional()
  @IsIn(PLACE_FUTURE_STATES)
  futureState?: (typeof PLACE_FUTURE_STATES)[number];
}
