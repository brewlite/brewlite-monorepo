import { OrderStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  it('filters out products without any available initialized-inventory size in findAll()', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Cà phê sữa đá',
        isAvailable: true,
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Cà phê', isActive: true },
        sizes: [
          {
            id: 'size-m',
            productId: 'prod-1',
            name: 'M',
            extraPrice: '0',
            onHand: 10,
            reserved: 2,
            isAvailable: true,
            version: 1,
          },
          {
            id: 'size-l',
            productId: 'prod-1',
            name: 'L',
            extraPrice: '5000',
            onHand: null,
            reserved: 0,
            isAvailable: true,
            version: 0,
          },
        ],
      },
    ]);

    const service = new ProductsService({
      product: { findMany },
    } as unknown as PrismaService);

    const list = await service.findAll();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAvailable: true,
          sizes: {
            some: {
              isAvailable: true,
              onHand: { not: null },
            },
          },
        }),
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0].sizes[0]).toMatchObject({
      availableQuantity: 8,
      inventoryStatus: 'AVAILABLE',
    });
    expect(list[0].sizes[1]).toMatchObject({
      availableQuantity: null,
      inventoryStatus: 'UNINITIALIZED',
    });
  });

  it('returns top 4 in-stock best-sellers from completed orders and backfills from newest available products', async () => {
    const makeRow = (id: string, name: string, onHand: number) => ({
      id,
      name,
      isAvailable: true,
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Cà phê', isActive: true },
      sizes: [
        {
          id: `size-${id}`,
          productId: id,
          name: 'M',
          extraPrice: '0',
          onHand,
          reserved: 0,
          isAvailable: true,
          version: 1,
        },
      ],
    });
    const findMany = jest.fn().mockResolvedValue([
      makeRow('newest-1', 'Matcha Latte', 10),
      makeRow('newest-2', 'Trà đào', 10),
      makeRow('best-2', 'Bạc xỉu', 10),
      makeRow('best-1', 'Cà phê sữa đá', 10),
      makeRow('sold-out-best', 'Espresso', 0),
      makeRow('newest-3', 'Cold Brew', 10),
    ]);
    const groupBy = jest.fn().mockResolvedValue([
      { productId: 'sold-out-best', _sum: { quantity: 50, lineTotal: 1500000 } },
      { productId: 'best-1', _sum: { quantity: 12, lineTotal: 420000 } },
      { productId: 'best-2', _sum: { quantity: 8, lineTotal: 320000 } },
      { productId: 'deleted-prod', _sum: { quantity: 5, lineTotal: 200000 } },
    ]);

    const service = new ProductsService({
      product: { findMany },
      orderItem: { groupBy },
    } as unknown as PrismaService);

    const recommended = await service.findRecommendations(4);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['productId'],
      where: {
        order: { isLegacy: false, status: OrderStatus.COMPLETED },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: [
        { _sum: { quantity: 'desc' } },
        { _sum: { lineTotal: 'desc' } },
      ],
    });
    expect(recommended.map((p) => p.id)).toEqual([
      'best-1',
      'best-2',
      'newest-1',
      'newest-2',
    ]);
  });
});
