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
  partnerStatus!: object | null;

  @ApiProperty({ nullable: true, type: Object })
  latestNote!: object | null;

  @ApiProperty({ type: Object })
  dailyEntryStatus!: object;

  @ApiProperty({ nullable: true, type: Object })
  nextAnniversary!: object | null;

  @ApiProperty({ nullable: true, type: Object })
  randomMemory!: object | null;

  @ApiProperty({ nullable: true, type: Object })
  activeWish!: object | null;
}

export class TodayUpcomingResponseDto {
  @ApiProperty({ format: "date-time" })
  serverNow!: string;

  @ApiProperty({ minimum: 1, maximum: 365 })
  days!: number;

  @ApiProperty({ type: [Object] })
  anniversaries!: object[];

  @ApiProperty({ type: [Object] })
  plans!: object[];

  @ApiProperty({
    type: [Object],
    description: "Metadata only; never includes capsule body or media details",
  })
  capsules!: object[];
}
