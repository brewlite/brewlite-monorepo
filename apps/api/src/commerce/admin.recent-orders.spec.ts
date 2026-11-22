import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StoreAdminService } from './admin.service';

describe('StoreAdminService recent orders', () => {
  const findUnique = jest.fn();
  const count = jest.fn();
  const findMany = jest.fn();
  const service = new StoreAdminService(
    { user: { findUnique }, order: { count, findMany } } as unknown as PrismaService,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a paged non-legacy order summary for a customer', async () => {
    findUnique.mockResolvedValue({ role: UserRole.CUSTOMER });
    count.mockResolvedValue(12);
    findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderCode: 'BL-001',
        status: OrderStatus.COMPLETED,
        finalTotal: '85000',
        createdAt: new Date('2026-11-13T08:00:00Z'),
      },
    ]);

    await expect(service.recentOrders('customer-id', 2, 10, OrderStatus.COMPLETED)).resolves.toEqual({
      items: expect.any(Array),
      page: 2,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        userId: 'customer-id',
        isLegacy: false,
        status: OrderStatus.COMPLETED,
      },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: 'customer-id',
        isLegacy: false,
        status: OrderStatus.COMPLETED,
      },
      select: {
        id: true,
        orderCode: true,
        status: true,
        finalTotal: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    });
  });

  it('rejects missing, non-customer and invalid limits', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(service.recentOrders('missing-id', 1, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    findUnique.mockResolvedValueOnce({ role: UserRole.STAFF });
    await expect(service.recentOrders('staff-id', 1, 10)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    findUnique.mockResolvedValueOnce({ role: UserRole.CUSTOMER });
    await expect(service.recentOrders('customer-id', 1, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
