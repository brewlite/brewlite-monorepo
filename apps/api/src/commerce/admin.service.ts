import { InventoryService } from '../inventory/inventory.service';
import { inventoryAdjustment } from '../inventory/inventory.dto';
import { Prisma } from '@prisma/client';
function scalar(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (value instanceof Prisma.Decimal) return value.toString();
  throw new BadRequestException('Giá trị phải là chuỗi hoặc số.');
}
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommerceService,
  record,
  integer,
  text,
  money,
} from './commerce.service';

@Injectable()
export class StoreAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly commerce: CommerceService,
    private readonly inventoryService: InventoryService,
  ) {}
  async dashboard() {
    const where = {
      isLegacy: false,
      status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] as const },
    };
    const totals = await this.db.order.aggregate({
      where: { ...where, status: { in: [...where.status.in] } },
      _sum: { finalTotal: true },
      _count: true,
    });
    return {
      paidOrders: totals._count,
      simulatedRevenue: totals._sum.finalTotal?.toFixed(0) ?? '0',
      products: await this.db.product.count(),
      label:
        'Doanh thu thanh toán mô phỏng; không phải tiền thật. Không bao gồm đơn legacy/demo.',
    };
  }
  async list(kind: string) {
    switch (kind) {
      case 'categories':
        return this.db.category.findMany({ orderBy: { name: 'asc' } });
      case 'products':
        return this.db.product.findMany({
          include: { category: true, sizes: true },
          orderBy: { createdAt: 'desc' },
        });
      case 'sizes':
        return (await this.db.size.findMany({
          include: { product: { select: { name: true, isAvailable: true, category: { select: { isActive: true } } } } },
          orderBy: { name: 'asc' },
        })).map((size) => ({ ...size, availableQuantity: size.onHand === null ? null : size.onHand - size.reserved,
          sellingStatus: !size.isAvailable || !size.product.isAvailable || size.product.category?.isActive === false ? 'STOPPED' : size.onHand === null ? 'UNINITIALIZED' : size.onHand - size.reserved > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK' }));
      case 'toppings':
        return this.db.topping.findMany({ orderBy: { name: 'asc' } });
      case 'promotions':
        return this.db.promotion.findMany({ orderBy: { createdAt: 'desc' } });
      case 'users':
        return this.db.user.findMany({
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            isActive: true,
            emailVerifiedAt: true,
            loyaltyPoints: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
      default:
        throw new NotFoundException();
    }
  }
  async orderStats(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException(
        'Chỉ tài khoản CUSTOMER có thống kê đơn hàng.',
      );

    const grouped = await this.db.order.groupBy({
      by: ['status'],
      where: { userId, isLegacy: false },
      _count: { _all: true },
    });
    let totalOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    for (const group of grouped) {
      const count = group._count._all;
      totalOrders += count;
      if (group.status === OrderStatus.COMPLETED) completedOrders = count;
      if (group.status === OrderStatus.CANCELLED) cancelledOrders = count;
    }
    return { totalOrders, completedOrders, cancelledOrders };
  }
  async recentOrders(
    userId: string,
    page: number,
    pageSize: number,
    status?: OrderStatus,
  ) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');
    if (user.role !== UserRole.CUSTOMER)
      throw new ForbiddenException(
        'Chỉ tài khoản CUSTOMER có danh sách đơn hàng.',
      );
    if (page < 1 || pageSize < 1)
      throw new BadRequestException('Phân trang không hợp lệ.');
    if (status && !Object.values(OrderStatus).includes(status))
      throw new BadRequestException('Trạng thái đơn không hợp lệ.');
    const safePageSize = Math.min(pageSize, 50);
    const where = {
      userId,
      isLegacy: false,
      ...(status ? { status } : {}),
    };
    const [total, items] = await Promise.all([
      this.db.order.count({ where }),
      this.db.order.findMany({
        where,
        select: {
          id: true,
          orderCode: true,
          status: true,
          finalTotal: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * safePageSize,
        take: safePageSize,
      }),
    ]);
    return {
      items,
      page,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize),
    };
  }
  async save(kind: string, body: unknown, id?: string, actorId?: string) {
    const b = record(body);
    const active = (value: unknown, fallback = true) =>
      value === undefined ? fallback : value === true;
    if (kind === 'users') {
      if (!id)
        throw new BadRequestException(
          'Tài khoản phải đăng ký và xác minh email, không tạo User giả ở ADMIN.',
        );
      if (
        b.role !== undefined &&
        (typeof b.role !== 'string' || !['CUSTOMER', 'STAFF'].includes(b.role))
      )
        throw new BadRequestException(
          'Chỉ cấp CUSTOMER/STAFF qua giao diện này.',
        );
      return this.commerce.tx(async (tx) => {
        const old = await tx.user.findUniqueOrThrow({ where: { id } });
        if (b.role === 'STAFF' && (!old.emailVerifiedAt || !old.isActive))
          throw new BadRequestException(
            'Tài khoản STAFF phải đang hoạt động và đã xác minh email.',
          );
        if (old.role === 'ADMIN' || actorId === id)
          throw new BadRequestException(
            'Không đổi quyền/vô hiệu hóa ADMIN hoặc chính mình tại đây.',
          );
        const result = await tx.user.update({
          where: { id },
          data: {
            role: b.role as 'CUSTOMER' | 'STAFF' | undefined,
            isActive: active(b.isActive, old.isActive),
          },
          select: { id: true, role: true, isActive: true },
        });
        await tx.idempotencyRecord.create({
          data: {
            actorId: actorId!,
            operation: 'admin.user.change',
            key: crypto.randomUUID(),
            requestHash: id,
            result: {
              userId: id,
              previousRole: old.role,
              nextRole: result.role,
              isActive: result.isActive,
            },
            expiresAt: new Date(Date.now() + 31536000000),
          },
        });
        return result;
      });
    }
    if (kind === 'categories') {
      const old = id
        ? await this.db.category.findUniqueOrThrow({ where: { id } })
        : null;
      const data = {
        name: text(b.name ?? old?.name, 100),
        isActive: active(b.isActive, old?.isActive ?? true),
      };
      if (!data.name) throw new BadRequestException('Tên không được trống.');
      return id
        ? this.db.category.update({ where: { id }, data })
        : this.db.category.create({ data });
    }
    if (kind === 'products') {
      const old = id
        ? await this.db.product.findUniqueOrThrow({ where: { id } })
        : null;
      const data = {
        name: text(b.name ?? old?.name, 150),
        description: text(b.description ?? old?.description ?? '', 3000),
        imageUrl: text(b.imageUrl ?? old?.imageUrl ?? '', 1000) || null,
        categoryId: text(b.categoryId ?? old?.categoryId, 80),
        basePrice: money(scalar(b.basePrice ?? old?.basePrice ?? '')),
        isAvailable: active(b.isAvailable, old?.isAvailable ?? true),
      };
      if (!data.name) throw new BadRequestException('Tên không được trống.');
      return id
        ? this.db.product.update({ where: { id }, data })
        : this.db.product.create({ data });
    }
    if (kind === 'sizes') {
      if ('reserved' in b || 'onHand' in b)
        throw new BadRequestException(
          'Tồn kho chỉ được điều chỉnh qua endpoint inventory; reserved chỉ do hệ thống quản lý.',
        );
      const old = id
        ? await this.db.size.findUniqueOrThrow({ where: { id } })
        : null;
      const data = {
        name: text(b.name ?? old?.name, 80),
        productId: text(b.productId ?? old?.productId, 80),
        extraPrice: money(scalar(b.extraPrice ?? old?.extraPrice ?? '')),
        isAvailable: active(b.isAvailable, old?.isAvailable ?? true),
      };
      if (!data.name) throw new BadRequestException('Tên không được trống.');
      if (old && data.productId !== old.productId)
        throw new BadRequestException('Không chuyển Size sang Product khác.');
      try {
        return id
          ? await this.db.size.update({ where: { id }, data })
          : await this.db.size.create({ data });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ConflictException(
            'Tên Size đã tồn tại trong sản phẩm (không phân biệt hoa/thường và khoảng trắng hai đầu).',
          );
        throw error;
      }
    }
    if (kind === 'toppings') {
      const old = id
        ? await this.db.topping.findUniqueOrThrow({ where: { id } })
        : null;
      const data = {
        name: text(b.name ?? old?.name, 100),
        price: money(scalar(b.price ?? old?.price ?? '')),
        isAvailable: active(b.isAvailable, old?.isAvailable ?? true),
      };
      return id
        ? this.db.topping.update({ where: { id }, data })
        : this.db.topping.create({ data });
    }
    if (kind === 'promotions') {
      return this.commerce.tx(async (tx) => {
        const old = id
          ? await tx.promotion.findUniqueOrThrow({ where: { id } })
          : null;
        const code = text(b.code ?? old?.code, 50).toUpperCase();
        const type = b.discountType ?? old?.discountType;
        if (
          typeof type !== 'string' ||
          !['FIXED_AMOUNT', 'PERCENTAGE'].includes(type)
        )
          throw new BadRequestException('Loại mã không hợp lệ.');
        const value = money(
          scalar(b.discountValue ?? old?.discountValue ?? ''),
        );
        if (type === 'PERCENTAGE' && (value.lt(1) || value.gt(50)))
          throw new BadRequestException('Phần trăm từ 1 đến 50.');
        const limit = integer(b.usageLimit ?? old?.usageLimit);
        if (limit < (old?.usedCount ?? 0) + (old?.reservedCount ?? 0))
          throw new BadRequestException('Quota thấp hơn lượt dùng/đang giữ.');
        const startDate = new Date(
          scalar(b.startDate ?? old?.startDate?.toISOString()),
        );
        const endDate = new Date(
          scalar(b.endDate ?? old?.endDate?.toISOString()),
        );
        if (
          !Number.isFinite(startDate.getTime()) ||
          !Number.isFinite(endDate.getTime()) ||
          startDate >= endDate
        )
          throw new BadRequestException('Thời hạn không hợp lệ.');
        const data = {
          code,
          discountType: type as 'PERCENTAGE' | 'FIXED_AMOUNT',
          discountValue: value,
          minOrderValue: money(
            scalar(b.minOrderValue ?? old?.minOrderValue ?? '0'),
          ),
          maxDiscount:
            b.maxDiscount === '' || b.maxDiscount === null
              ? null
              : money(scalar(b.maxDiscount ?? old?.maxDiscount ?? '99999999')),
          usageLimit: limit,
          startDate,
          endDate,
          isActive: active(b.isActive, old?.isActive ?? true),
        };
        return id
          ? tx.promotion.update({ where: { id }, data })
          : tx.promotion.create({ data });
      });
    }
    throw new NotFoundException();
  }
  async inventory(id: string, body: unknown, actorId: string) {
    const { onHand, expectedVersion: version } = inventoryAdjustment(body);
    return this.commerce.tx(async (tx) => {
      const current = await tx.size.findUniqueOrThrow({ where: { id } });
      const next = await this.inventoryService.setOnHand(
        tx,
        id,
        onHand,
        version,
      );
      await tx.idempotencyRecord.create({
        data: {
          actorId,
          operation: 'admin.inventory.change',
          key: crypto.randomUUID(),
          requestHash: id,
          result: {
            sizeId: id,
            before: current.onHand,
            after: onHand,
            reserved: current.reserved,
            version: next.version,
          },
          expiresAt: new Date(Date.now() + 31536000000),
        },
      });
      return next;
    });
  }
}
