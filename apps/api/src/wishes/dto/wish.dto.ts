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
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const WISH_CATEGORIES = [
  "TRAVEL",
  "FOOD",
  "LIFE",
  "LEARNING",
  "COMMEMORATION",
  "FAMILY",
  "PHOTOGRAPHY",
  "ADVENTURE",
  "CUSTOM",
] as const;

export const WISH_STATUSES = [
  "IDEA",
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CONVERTED_TO_MEMORY",
] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

function trimmedStrings(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : item))
    : value;
}

export class ListWishesQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ description: "Opaque pagination cursor" })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ enum: WISH_STATUSES })
  @IsOptional()
  @IsIn(WISH_STATUSES)
  status?: (typeof WISH_STATUSES)[number];

  @ApiPropertyOptional({ enum: WISH_CATEGORIES })
  @IsOptional()
  @IsIn(WISH_CATEGORIES)
  category?: (typeof WISH_CATEGORIES)[number];

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  placeId?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  query?: string;
}

export class CreateWishDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 50_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  expectation?: string | null;

  @ApiPropertyOptional({ enum: WISH_CATEGORIES, default: "CUSTOM" })
  @IsOptional()
  @IsIn(WISH_CATEGORIES)
  category?: (typeof WISH_CATEGORIES)[number];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;
}

export class UpdateWishDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 50_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  expectation?: string | null;

  @ApiPropertyOptional({ enum: WISH_CATEGORIES })
  @IsOptional()
  @IsIn(WISH_CATEGORIES)
  category?: (typeof WISH_CATEGORIES)[number];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;
}

export class DeleteWishQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class WishPlanDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 50_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  itinerary?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @Transform(({ value }) => trimmedStrings(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  preparations?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @Transform(({ value }) => trimmedStrings(value))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(100, { each: true })
  participants?: string[];

  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  expectation?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "startsAt must include Z or an explicit UTC offset",
  })
  startsAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "endsAt must include Z or an explicit UTC offset",
  })
  endsAt?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "reminderAt must include Z or an explicit UTC offset",
  })
  reminderAt?: string | null;
}

export class WishActionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CompleteWishDto extends WishActionDto {
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "completedAt must include Z or an explicit UTC offset",
  })
  completedAt?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 50_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  completionNote?: string | null;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  mediaIds?: string[];
}

export class ReopenWishDto extends WishActionDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 10_000 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  note?: string | null;
}

export class CreateWishUpdateDto {
  @ApiProperty({ minLength: 1, maxLength: 10_000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  note!: string;
}
