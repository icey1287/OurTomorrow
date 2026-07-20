import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class NearbyPlacesDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 3_000, default: 1_000 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(3_000)
  radius?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 6 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  limit?: number;
}
