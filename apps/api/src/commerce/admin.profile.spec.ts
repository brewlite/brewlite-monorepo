import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoreAdminService } from './admin.service';
import type { PrismaService } from '../prisma/prisma.service';
describe('ADMIN account profiles and staff activity', () => {
  const user = { findUnique: jest.fn() };
  const order = { count: jest.fn() };
  const history = { groupBy: jest.fn(), findMany: jest.fn() };
  const service = new StoreAdminService({ user, order, orderStatusHistory: history } as unknown as PrismaService, {} as never, {} as never);
  beforeEach(() => jest.clearAllMocks());
  it('selects only public account fields and handles missing accounts', async () => {
    user.findUnique.mockResolvedValueOnce({ id: 'staff', role: 'STAFF' }).mockResolvedValueOnce(null);
    expect(await service.userDetail('staff')).toEqual({ id: 'staff', role: 'STAFF' });
    const selection = user.findUnique.mock.calls[0][0].select;
    expect(selection.phone).toBeUndefined();
    expect(selection.createdAt).toBe(true);
    expect(selection.passwordHash).toBeUndefined();
    expect(selection.emailVerification).toBeUndefined();
    await expect(service.userDetail('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('counts distinct participated orders separately from status updates, excluding legacy orders', async () => {
    user.findUnique.mockResolvedValue({ role: 'STAFF' });
    order.count.mockResolvedValue(2);
    history.groupBy.mockResolvedValue([{ toStatus: 'PREPARING', _count: { _all: 3 } }, { toStatus: 'READY', _count: { _all: 2 } }]);
    history.findMany.mockResolvedValue([]);
    const result = await service.staffActivity('staff');
    expect(result.participatedOrders).toBe(2);
    expect(result.totalUpdates).toBe(5);
    expect(history.findMany.mock.calls[0][0].where).toEqual({ actorId: 'staff', order: { isLegacy: false } });
    expect(history.findMany.mock.calls[0][0].take).toBe(20);
    expect(order.count.mock.calls[0][0].where).toEqual({ isLegacy: false, history: { some: { actorId: 'staff' } } });
  });
  it('does not read activity for customer or missing accounts', async () => {
    user.findUnique.mockResolvedValueOnce({ role: 'CUSTOMER' }).mockResolvedValueOnce(null);
    await expect(service.staffActivity('customer')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.staffActivity('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(history.findMany).not.toHaveBeenCalled();
  });
});
