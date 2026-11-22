import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StoreAdminService } from './admin.service';

describe('StoreAdminService order statistics', () => {
  const findUnique = jest.fn();
  const groupBy = jest.fn();
  const service = new StoreAdminService(
    { user: { findUnique }, order: { groupBy } } as unknown as PrismaService,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts only non-legacy orders by their actual status', async () => {
    findUnique.mockResolvedValue({ role: UserRole.CUSTOMER });
    groupBy.mockResolvedValue([
      { status: OrderStatus.PENDING, _count: { _all: 2 } },
      { status: OrderStatus.PAID, _count: { _all: 1 } },
      { status: OrderStatus.COMPLETED, _count: { _all: 3 } },
      { status: OrderStatus.CANCELLED, _count: { _all: 1 } },
    ]);

    await expect(service.orderStats('customer-id')).resolves.toEqual({
      totalOrders: 7,
      completedOrders: 3,
      cancelledOrders: 1,
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { userId: 'customer-id', isLegacy: false },
      _count: { _all: true },
    });
  });

  it('returns zeroes for a customer without orders', async () => {
    findUnique.mockResolvedValue({ role: UserRole.CUSTOMER });
    groupBy.mockResolvedValue([]);

    await expect(service.orderStats('customer-id')).resolves.toEqual({
      totalOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
    });
  });

  it('rejects missing and non-customer accounts', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(service.orderStats('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    findUnique.mockResolvedValueOnce({ role: UserRole.STAFF });
    await expect(service.orderStats('staff-id')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe('StoreAdminService statistics and session revocation', () => {
  it('ranks top products only from completed non-legacy orders', async () => {
    const D = Prisma.Decimal;
    const rows = [
      { productId: 'coffee', productName: 'Cà phê', quantity: 2, lineTotal: 100000, status: OrderStatus.COMPLETED, isLegacy: false },
      { productId: 'tea', productName: 'Trà', quantity: 3, lineTotal: 90000, status: OrderStatus.COMPLETED, isLegacy: false },
      { productId: 'juice', productName: 'Nước ép', quantity: 3, lineTotal: 60000, status: OrderStatus.COMPLETED, isLegacy: false },
      ...[OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.CANCELLED].map((status) => ({
        productId: 'coffee', productName: 'Cà phê', quantity: 100, lineTotal: 5000000, status, isLegacy: false,
      })),
      { productId: 'coffee', productName: 'Cà phê', quantity: 100, lineTotal: 5000000, status: OrderStatus.COMPLETED, isLegacy: true },
    ];
    const topItems = jest.fn().mockImplementation((query: {
      where: { order: { status: OrderStatus; isLegacy: boolean } };
      take: number;
    }) => {
      const eligible = rows.filter((row) => row.status === query.where.order.status && row.isLegacy === query.where.order.isLegacy);
      const totals = new Map<string, { productId: string; productName: string; _sum: { quantity: number; lineTotal: Prisma.Decimal } }>();
      for (const row of eligible) {
        const total = totals.get(row.productId) ?? {
          productId: row.productId, productName: row.productName,
          _sum: { quantity: 0, lineTotal: new D(0) },
        };
        total._sum.quantity += row.quantity;
        total._sum.lineTotal = total._sum.lineTotal.plus(row.lineTotal);
        totals.set(row.productId, total);
      }
      return [...totals.values()].sort((a, b) => b._sum.quantity - a._sum.quantity || b._sum.lineTotal.comparedTo(a._sum.lineTotal)).slice(0, query.take);
    });
    const paidOrders = jest.fn().mockResolvedValue([]);
    const service = new StoreAdminService({
      order: { findMany: paidOrders, groupBy: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: topItems },
      cashShift: { aggregate: jest.fn().mockResolvedValue({ _sum: { countedCash: new D(0), variance: new D(0) }, _count: 0 }) },
    } as unknown as PrismaService, {} as never, {} as never);

    const stats = await service.statistics();

    expect(topItems).toHaveBeenCalledWith({
      by: ['productId', 'productName'],
      where: { order: { isLegacy: false, status: OrderStatus.COMPLETED } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: [{ _sum: { quantity: 'desc' } }, { _sum: { lineTotal: 'desc' } }],
      take: 8,
    });
    expect(stats.topProducts).toEqual([
      { productId: 'tea', productName: 'Trà', quantity: 3, revenue: '90000' },
      { productId: 'juice', productName: 'Nước ép', quantity: 3, revenue: '60000' },
      { productId: 'coffee', productName: 'Cà phê', quantity: 2, revenue: '100000' },
    ]);
    expect(paidOrders).toHaveBeenCalledWith(expect.objectContaining({
      where: { isLegacy: false, status: { in: [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED] } },
    }));
  });

  it('aggregates channel revenue, status counts, discounts and top products', async () => {
    const D = Prisma.Decimal;
    const service = new StoreAdminService(
      {
        order: {
          findMany: jest.fn().mockResolvedValue([
            {
              channel: 'COUNTER_POS',
              finalTotal: new D(50000),
              discountAmount: new D(0),
              pointsUsed: 0,
              pointsDiscount: new D(0),
              payments: [{ method: 'CASH' }],
            },
            {
              channel: 'COUNTER_POS',
              finalTotal: new D(40000),
              discountAmount: new D(0),
              pointsUsed: 0,
              pointsDiscount: new D(0),
              payments: [{ method: 'WALLET' }],
            },
            {
              channel: 'CUSTOMER_APP',
              finalTotal: new D(60000),
              discountAmount: new D(10000),
              pointsUsed: 50,
              pointsDiscount: new D(5000),
              payments: [{ method: 'CARD' }],
            },
          ]),
          groupBy: jest.fn().mockResolvedValue([
            { status: OrderStatus.COMPLETED, _count: { _all: 3 } },
            { status: OrderStatus.CANCELLED, _count: { _all: 1 } },
          ]),
        },
        orderItem: {
          groupBy: jest.fn().mockResolvedValue([
            {
              productId: 'p1',
              productName: 'Cà phê sữa đá',
              _sum: { quantity: 5, lineTotal: new D(150000) },
            },
          ]),
        },
        cashShift: {
          aggregate: jest
            .fn()
            .mockResolvedValueOnce({ _sum: { countedCash: new D(550000), variance: new D(0) }, _count: 1 })
            .mockResolvedValueOnce({ _sum: { countedCash: new D(0), variance: new D(0) }, _count: 0 }),
        },
      } as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    const stats = await service.statistics();
    expect(stats.revenue).toEqual({
      total: '150000',
      paidOrders: 3,
      averageOrderValue: '50000',
      counterCash: { revenue: '50000', orders: 1 },
      counterQr: { revenue: '40000', orders: 1 },
      online: { revenue: '60000', orders: 1 },
    });
    expect(stats.statusCounts.COMPLETED).toBe(3);
    expect(stats.statusCounts.CANCELLED).toBe(1);
    expect(stats.discounts).toEqual({
      couponOrders: 1,
      couponDiscountTotal: '10000',
      pointsOrders: 1,
      pointsUsedTotal: 50,
      pointsDiscountTotal: '5000',
    });
    expect(stats.topProducts[0]).toEqual({
      productId: 'p1',
      productName: 'Cà phê sữa đá',
      quantity: 5,
      revenue: '150000',
    });
    expect(stats.cashSummary.pendingShiftCount).toBe(1);
  });

  it('revokes active auth sessions when admin changes role or locks user', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'u1',
          role: 'CUSTOMER',
          isActive: true,
          emailVerifiedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({
          id: 'u1',
          role: 'STAFF',
          isActive: true,
        }),
      },
      authSession: { updateMany },
      idempotencyRecord: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new StoreAdminService(
      {} as unknown as PrismaService,
      { tx: (fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never,
      {} as never,
    );

    await service.save('users', { role: 'STAFF', isActive: true }, 'u1', 'admin-1');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revokedAt: null },
      }),
    );
  });
});
