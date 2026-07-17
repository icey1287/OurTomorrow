import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

function trim(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function nullableTrim(value: unknown): unknown {
  return value === null ? null : trim(value);
}

export class CreateTagDto {
  @ApiProperty({ maxLength: 64 })
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: "#d97757" })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^(#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9_-]{0,31})$/, {
    message: "color must be a CSS token or hexadecimal color",
  })
  color?: string | null;
}

export class UpdateTagDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ maxLength: 64 })
  @Transform(({ value }) => trim(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ nullable: true, example: "#d97757" })
  @Transform(({ value }) => nullableTrim(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^(#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9_-]{0,31})$/, {
    message: "color must be a CSS token or hexadecimal color",
  })
  color?: string | null;
}

export class DeleteTagQueryDto {
  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
