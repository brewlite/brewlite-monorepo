import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        OR: [
          { orderId: null },
          { order: { isLegacy: false } },
        ],
      },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markAsRead(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    if (!result.count) {
      throw new NotFoundException('Thông báo không tồn tại hoặc bạn không có quyền.');
    }

    return { id, isRead: true };
  }
}
