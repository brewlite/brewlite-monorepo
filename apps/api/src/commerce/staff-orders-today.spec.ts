import { PrismaService } from '../prisma/prisma.service';
import { CommerceService } from './commerce.service';

describe('CommerceService staffTodayHistory', () => {
  it('queries only today (Asia/Ho_Chi_Minh) finalized and cancelled non-legacy orders', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CommerceService(
      { order: { findMany } } as unknown as PrismaService,
      {} as never,
      {} as never,
    );

    // 2026-11-23 01:25:00+07:00 === 2026-11-22T18:25:00Z -> VN day starts at 2026-11-22T17:00:00Z
    await service.staffTodayHistory(Date.parse('2026-11-22T18:25:00.000Z'));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isLegacy: false,
          status: { in: ['COMPLETED', 'CANCELLED'] },
          updatedAt: { gte: new Date('2026-11-22T17:00:00.000Z') },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    );
  });
});
