import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const CAPSULE_TYPES = [
  "TO_PARTNER",
  "TO_SELF",
  "TO_BOTH",
  "JOINT",
  "ANNIVERSARY",
  "EVENT",
  "FUTURE_LETTER",
] as const;

export const CAPSULE_UNLOCK_RULES = [
  "AT_TIME",
  "ANNIVERSARY",
  "WISH_COMPLETION",
  "MANUAL_CONDITION",
] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class CreateCapsuleDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: CAPSULE_TYPES })
  @IsIn(CAPSULE_TYPES)
  type!: (typeof CAPSULE_TYPES)[number];

  @ApiProperty({ enum: CAPSULE_UNLOCK_RULES })
  @IsIn(CAPSULE_UNLOCK_RULES)
  unlockRule!: (typeof CAPSULE_UNLOCK_RULES)[number];

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "unlockAt must include Z or an explicit UTC offset",
  })
  unlockAt?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  anniversaryId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  wishId?: string | null;

  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 500 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  unlockCondition?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresBothConfirmation?: boolean;

  @ApiProperty({ minLength: 1, maxLength: 100_000 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  message!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  mediaIds?: string[];
}

export class UpdateCapsuleDto {
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

  @ApiPropertyOptional({ enum: CAPSULE_TYPES })
  @IsOptional()
  @IsIn(CAPSULE_TYPES)
  type?: (typeof CAPSULE_TYPES)[number];

  @ApiPropertyOptional({ enum: CAPSULE_UNLOCK_RULES })
  @IsOptional()
  @IsIn(CAPSULE_UNLOCK_RULES)
  unlockRule?: (typeof CAPSULE_UNLOCK_RULES)[number];

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "unlockAt must include Z or an explicit UTC offset",
  })
  unlockAt?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  anniversaryId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  wishId?: string | null;

  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 500 })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  unlockCondition?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresBothConfirmation?: boolean;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100_000 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  message?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  mediaIds?: string[];
}

export class CapsuleActionDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class DeleteCapsuleQueryDto extends CapsuleActionDto {}
