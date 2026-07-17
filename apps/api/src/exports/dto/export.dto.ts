import { Transform } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const EXPORT_FORMATS = ["ZIP", "JSON"] as const;

export class CreateExportDto {
  @ApiProperty({
    description:
      "Explicit confirmation for this local role; this is not a password or re-authentication step",
    example: true,
  })
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  @Equals(true)
  confirmed!: true;

  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: "ZIP" })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: (typeof EXPORT_FORMATS)[number] = "ZIP";
}
