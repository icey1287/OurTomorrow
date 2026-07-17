import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeRelayService } from "./realtime-relay.service";

@Module({
  providers: [RealtimeGateway, RealtimeRelayService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
