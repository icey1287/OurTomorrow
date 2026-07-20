import { ApiProperty } from "@nestjs/swagger";
import {
  IDENTITY_ROLES,
  type IdentityRole,
} from "../../identity/identity.constants";

export class UserSummaryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: [1, 2] })
  slot!: 1 | 2;

  @ApiProperty({ enum: IDENTITY_ROLES })
  role!: IdentityRole;

  @ApiProperty({ example: "甲" })
  displayName!: string;
}

export class CoupleSummaryDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: "2024-01-01" })
  startDate!: string;

  @ApiProperty({ example: "Asia/Shanghai" })
  timezone!: string;

  @ApiProperty({ nullable: true })
  signature!: string | null;

  @ApiProperty({ type: () => [UserSummaryDto] })
  members!: UserSummaryDto[];
}
