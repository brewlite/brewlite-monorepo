import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceService } from './commerce.service';

describe('CommerceService loyalty points 50% cap', () => {
  function setup(loyaltyPoints: number) {
    const D = Prisma.Decimal;
    const product = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Cà phê sữa đá',
      basePrice: new D(100000),
      isAvailable: true,
      category: { isActive: true },
    };
    const size = {
      id: '22222222-2222-4222-8222-222222222222',
      productId: product.id,
      name: 'M',
      extraPrice: new D(0),
      isAvailable: true,
      onHand: 10,
      reserved: 0,
    };
    const promotion = {
      id: 'promo-1',
      code: 'SAVE10',
      discountType: 'FIXED_AMOUNT',
      discountValue: new D(10000),
      maxDiscount: null,
      minOrderValue: null,
      usageLimit: 10,
      usedCount: 0,
      reservedCount: 0,
      isActive: true,
      startDate: new Date(Date.now() - 60000),
      endDate: new Date(Date.now() + 60000),
    };
    const inventory = {
      validateSellableConfiguration: jest.fn().mockResolvedValue({
        product,
        size: { ...size, availableQuantity: 10 },
        toppings: [],
      }),
    };
    const db = {
      promotion: { findUnique: jest.fn().mockResolvedValue(promotion) },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          loyaltyPoints,
          reservedPoints: 0,
        }),
      },
    } as unknown as PrismaService;
    const service = new CommerceService(db, inventory as never, {} as never);
    return { service, product, size };
  }

  it('allows redeeming points up to 50% of after-coupon total and rejects above 50%', async () => {
    const { service, product, size } = setup(500);
    const item = {
      productId: product.id,
      sizeId: size.id,
      quantity: 1,
      toppingIds: [],
      note: '',
    };

    // subtotal = 100,000; coupon = 10,000 => after = 90,000 => 50% cap = 45,000 = 450 points
    const allowed = await service.quote('user-1', {
      items: [item],
      couponCode: 'SAVE10',
      pointsUsed: 450,
    });
    expect(allowed.pointsUsed).toBe(450);
    expect(allowed.pointsDiscount).toBe('45000');
    expect(allowed.finalTotal).toBe('45000');

    await expect(
      service.quote('user-1', {
        items: [item],
        couponCode: 'SAVE10',
        pointsUsed: 451,
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'POINTS_EXCEED_CAP',
        message: 'Điểm vượt số dư khả dụng hoặc giới hạn 50%.',
      },
    });
  });
});
