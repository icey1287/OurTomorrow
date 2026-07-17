import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class SaveDailyEntryDto {
  @ApiProperty({
    description: "The current identity's private answer for today",
    maxLength: 20_000,
  })
  @IsString()
  @MaxLength(20_000)
  answer!: string;

  @ApiPropertyOptional({
    description: "Required when replacing an existing draft",
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class SubmitDailyEntryDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class AddDailyEntryPostscriptDto {
  @ApiProperty({ maxLength: 2_000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  postscript!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class DailyEntryCalendarQueryDto {
  @ApiProperty({ example: "2026-07", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class DailyEntryDateParamsDto {
  @ApiProperty({ example: "2026-07-16", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
