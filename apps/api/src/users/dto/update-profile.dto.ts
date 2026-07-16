import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export class UpdateProfileDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nicknameInRelationship?: string | null;
}
