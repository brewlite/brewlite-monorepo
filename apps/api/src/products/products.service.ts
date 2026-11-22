import { OrderStatus, type Size } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function publicSize(size: Size) {
  const availableQuantity =
    size.onHand === null ? null : size.onHand - size.reserved;
  const inventoryStatus =
    availableQuantity === null
      ? 'UNINITIALIZED'
      : size.isAvailable && availableQuantity > 0
        ? 'AVAILABLE'
        : 'OUT_OF_STOCK';
  return { ...size, availableQuantity, inventoryStatus };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const products = await this.prisma.product.findMany({
      where: {
        isAvailable: true,
        OR: [{ categoryId: null }, { category: { isActive: true } }],
        sizes: {
          some: {
            isAvailable: true,
            onHand: { not: null },
          },
        },
      },
      include: {
        category: true,
        sizes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return products.map((product) => ({
      ...product,
      sizes: product.sizes.map(publicSize),
    }));
  }

  async findRecommendations(limit = 4) {
    const [catalog, topSales] = await Promise.all([
      this.findAll(),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: { isLegacy: false, status: OrderStatus.COMPLETED },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: [
          { _sum: { quantity: 'desc' } },
          { _sum: { lineTotal: 'desc' } },
        ],
      }),
    ]);

    const inStock = catalog.filter((product) =>
      product.sizes.some((size) => size.inventoryStatus === 'AVAILABLE'),
    );
    const eligible = inStock.length > 0 ? inStock : catalog;
    const byId = new Map(eligible.map((product) => [product.id, product]));
    const picked: typeof eligible = [];
    const seen = new Set<string>();

    for (const sale of topSales) {
      if (picked.length >= limit) break;
      const product = byId.get(sale.productId);
      if (product && !seen.has(product.id)) {
        seen.add(product.id);
        picked.push(product);
      }
    }

    for (const product of eligible) {
      if (picked.length >= limit) break;
      if (!seen.has(product.id)) {
        seen.add(product.id);
        picked.push(product);
      }
    }

    return picked;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        sizes: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Sản phẩm với ID ${id} không tồn tại.`);
    }

    // Lấy kèm danh sách topping khả dụng để màn hình chi tiết món hiển thị tùy chọn cho khách
    const availableToppings = await this.prisma.topping.findMany({
      where: { isAvailable: true },
      orderBy: { price: 'asc' },
    });

    return {
      ...product,
      sizes: product.sizes.map(publicSize),
      availableToppings,
    };
  }
}
