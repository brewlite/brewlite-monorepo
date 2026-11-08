import {
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import {
  JwtAuthGuard,
  OriginGuard,
  type AuthRequest,
} from '../auth/auth.guards';

@Controller('notifications')
@UseGuards(OriginGuard, JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@Req() req: AuthRequest) {
    return this.notificationsService.findAllForUser(req.principal.user.id);
  }

  @Patch(':id/read')
  async markAsRead(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(id, req.principal.user.id);
  }
}
