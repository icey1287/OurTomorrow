import { ApiProperty } from "@nestjs/swagger";
import { TouchEventKind } from "@prisma/client";
import { IsEnum } from "class-validator";

export class CreateTouchEventDto {
  @ApiProperty({ enum: TouchEventKind })
  @IsEnum(TouchEventKind)
  kind!: TouchEventKind;
}
