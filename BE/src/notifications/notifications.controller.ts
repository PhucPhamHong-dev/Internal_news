import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../common/current-user.decorator";
import { NotificationsService } from "./notifications.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("notifications")
  list(@CurrentUser() user: AuthUser) {
    return this.notificationsService.list(user.sub);
  }

  @Post("notifications/:id/read")
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notificationsService.markRead(user.sub, id);
  }

  @Get("notifications/unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.unreadCount(user.sub);
  }
}
