import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
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
