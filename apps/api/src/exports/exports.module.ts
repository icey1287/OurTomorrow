import { Module } from "@nestjs/common";
import { AnniversariesModule } from "../anniversaries/anniversaries.module";
import { CapsulesModule } from "../capsules/capsules.module";
import { IdempotencyModule } from "../common/idempotency/idempotency.module";
import { DailyEntriesModule } from "../daily-entries/daily-entries.module";
import { IdentityModule } from "../identity/identity.module";
import { MemoriesModule } from "../memories/memories.module";
import { NotesModule } from "../notes/notes.module";
import { PlansModule } from "../plans/plans.module";
import { StatusesModule } from "../statuses/statuses.module";
import { WishesModule } from "../wishes/wishes.module";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [
    IdentityModule,
    IdempotencyModule,
    MemoriesModule,
    NotesModule,
    DailyEntriesModule,
    StatusesModule,
    WishesModule,
    PlansModule,
    AnniversariesModule,
    CapsulesModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
