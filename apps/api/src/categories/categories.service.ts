import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isActive: true,
        _count: {
          select: { products: { where: { isAvailable: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
