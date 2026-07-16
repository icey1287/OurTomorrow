import { ApiProperty } from "@nestjs/swagger";
import { CoupleSummaryDto } from "../../common/dto/relationship-response.dto";

export class TodayRelationshipDto extends CoupleSummaryDto {
  @ApiProperty({ minimum: 1 })
  daysTogether!: number;
}

export class TodayResponseDto {
  @ApiProperty({ format: "date-time" })
  serverNow!: string;

  @ApiProperty({ example: "2026-07-16" })
  localDate!: string;

  @ApiProperty()
  greeting!: string;

  @ApiProperty({ type: () => TodayRelationshipDto })
  relationship!: TodayRelationshipDto;

  @ApiProperty({ nullable: true, type: Object })
  partnerStatus!: null;

  @ApiProperty({ nullable: true, type: Object })
  latestNote!: null;

  @ApiProperty({ nullable: true, type: Object })
  dailyEntryStatus!: null;

  @ApiProperty({ nullable: true, type: Object })
  nextAnniversary!: null;

  @ApiProperty({ nullable: true, type: Object })
  randomMemory!: null;

  @ApiProperty({ nullable: true, type: Object })
  activeWish!: null;
}
