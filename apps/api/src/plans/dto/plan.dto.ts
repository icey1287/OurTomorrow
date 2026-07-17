import { PlanStatus } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from "class-validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

function trimArray(value: unknown): unknown {
  return Array.isArray(value) ? value.map(trim) : value;
}

export class ListPlansQueryDto {
  @ApiPropertyOptional({ enum: PlanStatus })
  @IsOptional()
  @IsIn(Object.values(PlanStatus))
  status?: PlanStatus;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  wishId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  anniversaryId?: string;
}

export class CreatePlanDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  wishId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  anniversaryId?: string | null;

  @ApiPropertyOptional({ example: "2026-01-01", nullable: true })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY)
  anniversaryOccurrenceDate?: string | null;

  @ApiPropertyOptional({ maxLength: 20_000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  itinerary?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @Transform(({ value }) => trimArray(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  preparations?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @Transform(({ value }) => trimArray(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  participants?: string[];

  @ApiPropertyOptional({ maxLength: 4_000, nullable: true })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  expectation?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(EXPLICIT_OFFSET, {
    message: "startsAt must include Z or an explicit UTC offset",
  })
  startsAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(EXPLICIT_OFFSET, {
    message: "endsAt must include Z or an explicit UTC offset",
  })
  endsAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(EXPLICIT_OFFSET, {
    message: "reminderAt must include Z or an explicit UTC offset",
  })
  reminderAt?: string | null;
}

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class PlanActionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class DeletePlanQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
