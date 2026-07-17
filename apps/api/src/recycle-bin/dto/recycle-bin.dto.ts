import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export const RECYCLE_BIN_RESOURCE_TYPES = [
  "MEMORY",
  "NOTE",
  "WISH",
  "PLAN",
  "ANNIVERSARY",
  "CAPSULE",
  "PLACE",
  "TAG",
  "MEDIA",
] as const;

export class ListRecycleBinQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @ApiPropertyOptional({ description: "Opaque pagination cursor" })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({
    enum: RECYCLE_BIN_RESOURCE_TYPES,
    description: "Case-insensitive resource type filter",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsIn(RECYCLE_BIN_RESOURCE_TYPES)
  type?: (typeof RECYCLE_BIN_RESOURCE_TYPES)[number];
}
