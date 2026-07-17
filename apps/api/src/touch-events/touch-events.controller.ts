import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { CreateTouchEventDto } from "./dto/touch-event.dto";
import type { TouchEventView } from "./touch-event.presentation";
import { TouchEventsService } from "./touch-events.service";

@ApiTags("touch-events")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("touch-events")
export class TouchEventsController {
  constructor(
    @Inject(TouchEventsService)
    private readonly touchEvents: TouchEventsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: "A low-frequency signal sent to the fixed partner",
  })
  @ApiTooManyRequestsResponse({
    description: "Cooldown or hourly limit is active",
  })
  create(
    @CurrentIdentityRole() role: IdentityRole,
    @Body(createValidationPipe(CreateTouchEventDto)) dto: CreateTouchEventDto,
  ): Promise<TouchEventView> {
    return this.touchEvents.create(role, dto);
  }
}
