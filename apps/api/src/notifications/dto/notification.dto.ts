import { Type } from "class-transformer";
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

export const NOTIFICATION_STATUSES = ["UNREAD", "READ", "ARCHIVED"] as const;

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_STATUSES })
  @IsOptional()
  @IsIn(NOTIFICATION_STATUSES)
  status?: (typeof NOTIFICATION_STATUSES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 800 })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  cursor?: string;
}
