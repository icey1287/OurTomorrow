import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import type { MediaAssetSummary } from "../memories/memory.presentation";
import type { AnnualReviewView } from "./annual-review.presentation";
import { AnnualReviewsService } from "./annual-reviews.service";
import {
  PublishAnnualReviewDto,
  UpdateAnnualReviewDto,
} from "./dto/annual-review.dto";

@ApiTags("annual-reviews")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("annual-reviews")
export class AnnualReviewsController {
  constructor(
    @Inject(AnnualReviewsService)
    private readonly annualReviews: AnnualReviewsService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: "Annual review books in descending year order",
  })
  list(@CurrentIdentityRole() role: IdentityRole): Promise<AnnualReviewView[]> {
    return this.annualReviews.list(role);
  }

  @Get(":year")
  @ApiOkResponse({
    description: "Annual review without private source content",
  })
  get(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("year", ParseIntPipe) year: number,
  ): Promise<AnnualReviewView> {
    return this.annualReviews.get(role, year);
  }

  @Get(":year/media-options")
  @ApiOkResponse({
    description: "Ready images from published memories in the review year",
  })
  mediaOptions(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("year", ParseIntPipe) year: number,
  ): Promise<MediaAssetSummary[]> {
    return this.annualReviews.mediaOptions(role, year);
  }

  @Post(":year")
  @ApiOkResponse({
    description: "Idempotently queued annual review generation",
  })
  request(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("year", ParseIntPipe) year: number,
  ): Promise<AnnualReviewView> {
    return this.annualReviews.request(role, year);
  }

  @Patch(":year")
  @ApiOkResponse({
    description: "Updated the current contribution or shared letter",
  })
  update(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("year", ParseIntPipe) year: number,
    @Body(createValidationPipe(UpdateAnnualReviewDto))
    dto: UpdateAnnualReviewDto,
  ): Promise<AnnualReviewView> {
    return this.annualReviews.update(role, year, dto);
  }

  @Post(":year/publish")
  @ApiOkResponse({ description: "Published a ready annual review" })
  publish(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("year", ParseIntPipe) year: number,
    @Body(createValidationPipe(PublishAnnualReviewDto))
    dto: PublishAnnualReviewDto,
  ): Promise<AnnualReviewView> {
    return this.annualReviews.publish(role, year, dto);
  }
}
