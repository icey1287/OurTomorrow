import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, Length } from "class-validator";
import {
  CoupleSummaryDto,
  UserSummaryDto,
} from "../../common/dto/relationship-response.dto";
import { IDENTITY_ROLES, type IdentityRole } from "../identity.constants";

export class SelectIdentityDto {
  @ApiProperty({ enum: IDENTITY_ROLES })
  @IsIn(IDENTITY_ROLES)
  role!: IdentityRole;
}

export class ResolveIdentityDto {
  @ApiProperty({ example: "示例用户甲" })
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class IdentityResponseDto {
  @ApiProperty({ enum: IDENTITY_ROLES })
  role!: IdentityRole;

  @ApiProperty({ type: () => UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: () => CoupleSummaryDto })
  couple!: CoupleSummaryDto;
}
