import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";

export const ANNIVERSARY_TYPES = [
  "RELATIONSHIP",
  "FIRST_MEETING",
  "BIRTHDAY",
  "MARRIAGE",
  "MOVING",
  "PET_BIRTHDAY",
  "CUSTOM",
] as const;

export const ANNIVERSARY_REPEATS = ["NONE", "YEARLY"] as const;
export const ANNIVERSARY_LEAP_DAY_RULES = ["FEBRUARY_28", "MARCH_1"] as const;

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class CreateAnniversaryDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ enum: ANNIVERSARY_TYPES, default: "CUSTOM" })
  @IsOptional()
  @IsIn(ANNIVERSARY_TYPES)
  type?: (typeof ANNIVERSARY_TYPES)[number];

  @ApiProperty({ format: "date", example: "2024-01-01" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be an ISO 8601 local date",
  })
  date!: string;

  @ApiPropertyOptional({ enum: ANNIVERSARY_REPEATS, default: "YEARLY" })
  @IsOptional()
  @IsIn(ANNIVERSARY_REPEATS)
  repeat?: (typeof ANNIVERSARY_REPEATS)[number];

  @ApiPropertyOptional({
    enum: ANNIVERSARY_LEAP_DAY_RULES,
    default: "FEBRUARY_28",
  })
  @IsOptional()
  @IsIn(ANNIVERSARY_LEAP_DAY_RULES)
  leapDayRule?: (typeof ANNIVERSARY_LEAP_DAY_RULES)[number];

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  backgroundMediaId?: string | null;
}

export class UpdateAnniversaryDto extends PartialType(CreateAnniversaryDto) {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class DeleteAnniversaryQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateAnniversaryReminderDto {
  @ApiProperty({ minimum: 0, maximum: 3650 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  daysBefore!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1439, default: 540 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  minuteOfDay?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
