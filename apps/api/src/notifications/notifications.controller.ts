import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createValidationPipe } from "../common/http/validation";
import {
  CurrentIdentityRole,
  IDENTITY_ROLE_HEADER,
} from "../identity/current-role.decorator";
import type { IdentityRole } from "../identity/identity.constants";
import { ListNotificationsQueryDto } from "./dto/notification.dto";
import type { NotificationView } from "./notification.presentation";
import {
  NotificationsService,
  type NotificationPage,
} from "./notifications.service";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@ApiTags("notifications")
@ApiHeader({
  name: IDENTITY_ROLE_HEADER,
  enum: ["boy", "girl"],
  required: true,
})
@Controller("notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @ApiOkResponse({ description: "Current identity's notifications" })
  list(
    @CurrentIdentityRole() role: IdentityRole,
    @Query(createValidationPipe(ListNotificationsQueryDto))
    query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    return this.notifications.list(role, query);
  }

  @Get("unread-count")
  @ApiOkResponse({ description: "Unread notification count" })
  unreadCount(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<{ count: number }> {
    return this.notifications.unreadCount(role);
  }

  @Post("mark-all-read")
  @ApiOkResponse({ description: "Number of notifications marked read" })
  markAllRead(
    @CurrentIdentityRole() role: IdentityRole,
  ): Promise<{ count: number }> {
    return this.notifications.markAllRead(role);
  }

  @Post(":id/mark-read")
  @ApiOkResponse({ description: "Read notification" })
  markRead(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) notificationId: string,
  ): Promise<NotificationView> {
    return this.notifications.markRead(role, notificationId);
  }

  @Post(":id/archive")
  @ApiOkResponse({ description: "Archived notification" })
  archive(
    @CurrentIdentityRole() role: IdentityRole,
    @Param("id", uuidPipe) notificationId: string,
  ): Promise<NotificationView> {
    return this.notifications.archive(role, notificationId);
  }
}
