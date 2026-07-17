import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from "class-validator";

export const UPLOAD_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type UploadImageMimeType = (typeof UPLOAD_IMAGE_MIME_TYPES)[number];

export class PresignUploadDto {
  @ApiProperty({ example: "summer-evening.jpg", maxLength: 255 })
  @IsString()
  @Length(1, 255)
  @Matches(/^[^\u0000-\u001f\u007f]+$/, {
    message: "originalName cannot contain control characters",
  })
  originalName!: string;

  @ApiProperty({ enum: UPLOAD_IMAGE_MIME_TYPES, example: "image/jpeg" })
  @IsIn(UPLOAD_IMAGE_MIME_TYPES)
  mimeType!: UploadImageMimeType;

  @ApiProperty({
    description: "Declared source size in bytes",
    example: 2_048_000,
  })
  @IsInt()
  @Min(1)
  size!: number;
}

export class CompleteUploadDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  uploadId!: string;
}

export class UploadIntentDto {
  @ApiProperty({ format: "uuid" })
  uploadId!: string;

  @ApiProperty({ example: "/api/v1/uploads/00000000/content" })
  uploadUrl!: string;

  @ApiProperty({ enum: ["PUT"] })
  method!: "PUT";

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;
}

export class MediaAssetSummaryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "summer-evening.jpg" })
  originalName!: string;

  @ApiProperty({ enum: ["image/jpeg", "image/webp"] })
  mimeType!: string;

  @ApiProperty({ description: "Processed source size in bytes" })
  size!: number;

  @ApiProperty({ nullable: true })
  width!: number | null;

  @ApiProperty({ nullable: true })
  height!: number | null;

  @ApiProperty({ example: "/api/v1/media/00000000" })
  url!: string;

  @ApiProperty({ example: "/api/v1/media/00000000/thumbnail" })
  thumbnailUrl!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}
