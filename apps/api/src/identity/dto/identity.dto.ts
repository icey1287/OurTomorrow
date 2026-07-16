import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
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

export class IdentityResponseDto {
  @ApiProperty({ enum: IDENTITY_ROLES })
  role!: IdentityRole;

  @ApiProperty({ type: () => UserSummaryDto })
  user!: UserSummaryDto;

  @ApiProperty({ type: () => CoupleSummaryDto })
  couple!: CoupleSummaryDto;
}
