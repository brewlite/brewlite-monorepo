import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { Actor } from '../access/access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';

const statusLabels: Partial<Record<OrderStatus, string>> = {
  PREPARING: 'Đang chuẩn bị',
  READY: 'Sẵn sàng nhận món',
  COMPLETED: 'Đã giao món',
};
const operationalStatuses: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];
const detailInclude = {
  items: { include: { toppings: true } },
  payments: {
    select: {
      id: true,
      method: true,
      status: true,
      amount: true,
      transactionRef: true,
      failureReason: true,
      createdAt: true,
      paidAt: true,
    },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
  },
  statusEvents: {
    select: { id: true, fromStatus: true, toStatus: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async list(
    where: Prisma.OrderWhereInput,
    query: OrderQueryDto,
    staff = false,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const [total, items] = await Promise.all([
          tx.order.count({ where }),
          tx.order.findMany({
            where,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            orderBy: [
              { createdAt: staff ? 'asc' : 'desc' },
              { id: staff ? 'asc' : 'desc' },
            ],
            select: {
              id: true,
              orderCode: true,
              status: true,
              finalTotal: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { items: true } },
            },
          }),
        ]);
        return {
          items,
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  listMine(userId: string, query: OrderQueryDto) {
    return this.list(
      { userId, ...(query.status ? { status: query.status } : {}) },
      query,
    );
  }

  listStaff(query: OrderQueryDto) {
    // A pending/cancelled filter yields no results, never leaks unpaid orders.
    return this.list(
      {
        AND: [
          { status: { in: operationalStatuses } },
          ...(query.status ? [{ status: query.status }] : []),
        ],
      },
      query,
      true,
    );
  }

  async getMine(id: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return order;
  }

  async getStaff(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, status: { in: operationalStatuses } },
      include: detailInclude,
    });
    if (!order)
      throw new NotFoundException('Không tìm thấy đơn đã thanh toán.');
    return order;
  }

  async updateStatus(id: string, actor: Actor, dto: UpdateOrderStatusDto) {
    if (actor.role !== UserRole.STAFF && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Không có quyền cập nhật đơn.');
    }
    const next: Partial<Record<OrderStatus, OrderStatus>> = {
      PAID: OrderStatus.PREPARING,
      PREPARING: OrderStatus.READY,
      READY: OrderStatus.COMPLETED,
    };
    if (next[dto.expectedStatus] !== dto.status) {
      throw new ConflictException(
        'Không được bỏ qua hoặc đảo ngược tiến độ đơn.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, status: { in: operationalStatuses } },
      });
      if (!order)
        throw new NotFoundException('Không tìm thấy đơn đã thanh toán.');

      // A network retry returns the same state without duplicate events.
      if (order.status === dto.status) return order;
      if (order.status !== dto.expectedStatus) {
        throw new ConflictException('Đơn đã thay đổi. Hãy tải lại trạng thái.');
      }
      const updated = await tx.order.updateMany({
        where: { id, status: dto.expectedStatus },
        data: { status: dto.status },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Đơn vừa được người khác cập nhật. Hãy tải lại.',
        );
      }
      await tx.orderStatusEvent.create({
        data: {
          orderId: id,
          actorId: actor.id,
          fromStatus: dto.expectedStatus,
          toStatus: dto.status,
        },
      });
      if (order.userId) {
        await tx.notification.create({
          data: {
            userId: order.userId,
            type: NotificationType.ORDER_STATUS_UPDATED,
            title: 'Cập nhật đơn hàng',
            content: `Đơn ${order.orderCode} chuyển sang ${statusLabels[dto.status] ?? dto.status}.`,
          },
        });
      }
      return tx.order.findUniqueOrThrow({ where: { id } });
    });
  }
}
