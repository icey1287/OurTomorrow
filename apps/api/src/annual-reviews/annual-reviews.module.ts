import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { AnnualReviewsController } from "./annual-reviews.controller";
import { AnnualReviewsService } from "./annual-reviews.service";

@Module({
  imports: [IdentityModule],
  controllers: [AnnualReviewsController],
  providers: [AnnualReviewsService],
  exports: [AnnualReviewsService],
})
export class AnnualReviewsModule {}
