import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import {
  AnniversaryLeapDayRule,
  AnniversaryRepeat,
  AnniversaryType,
  ConversionTargetType,
  WishCategory,
} from "@prisma/client";

export class ConvertNoteDto {
  @IsEnum(ConversionTargetType)
  targetType!: "MEMORY" | "WISH" | "ANNIVERSARY";

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "happenedAt must include Z or an explicit UTC offset",
  })
  happenedAt?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsEnum(WishCategory)
  category?: WishCategory;

  @IsOptional()
  @IsEnum(AnniversaryType)
  anniversaryType?: AnniversaryType;

  @IsOptional()
  @IsEnum(AnniversaryRepeat)
  repeat?: AnniversaryRepeat;

  @IsOptional()
  @IsEnum(AnniversaryLeapDayRule)
  leapDayRule?: AnniversaryLeapDayRule;

  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;
}

export class ConvertWishToMemoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  content?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i, {
    message: "happenedAt must include Z or an explicit UTC offset",
  })
  happenedAt?: string;

  @IsOptional()
  @IsUUID("4")
  placeId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID("4", { each: true })
  mediaIds?: string[];
}

export class ConvertCapsuleToMemoryDto extends ConvertWishToMemoryDto {}
