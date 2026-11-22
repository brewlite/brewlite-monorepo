import { BadRequestException } from '@nestjs/common';
import { StoreAdminService } from './admin.service';

describe('admin account search', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const service = new StoreAdminService({
    user: { count, findMany }, $transaction: (queries: unknown[]) => Promise.all(queries),
  } as never, {} as never, {} as never);
  beforeEach(() => { jest.clearAllMocks(); count.mockResolvedValue(126); findMany.mockResolvedValue([{ id: 'older-user' }]); });

  it('searches the full account table before pagination without returning private fields', async () => {
    await expect(service.users(5, 25, ' Older ', 'CUSTOMER')).resolves.toMatchObject({
      items: [{ id: 'older-user' }], total: 126, page: 5, totalPages: 6,
    });
    const options = findMany.mock.calls[0][0];
    expect(options).toMatchObject({ skip: 100, take: 25, where: {
      role: 'CUSTOMER', OR: [
        { fullName: { contains: 'Older', mode: 'insensitive' } },
        { email: { contains: 'Older', mode: 'insensitive' } },
      ],
    } });
    expect(count).toHaveBeenCalledWith({ where: options.where });
    expect(options.select.passwordHash).toBeUndefined();
    expect(options.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
  it.each([[0, 25, ''], [1, 0, ''], [1, 25, 'ROOT'], [Number.MAX_SAFE_INTEGER, 25, '']])(
    'rejects invalid pagination or role (%s, %s, %s)', async (page, size, role) => {
      await expect(service.users(page as number, size as number, '', role as string)).rejects.toBeInstanceOf(BadRequestException);
      expect(findMany).not.toHaveBeenCalled();
    },
  );
});
