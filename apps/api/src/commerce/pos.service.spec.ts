import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { RolesGuard } from '../auth/auth.guards';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceService } from './commerce.service';
import { StaffPosController } from './pos.controller';
import { PosService } from './pos.service';
import { VNPayService } from './vnpay.service';

const D = Prisma.Decimal;

describe('StaffPosController RBAC', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (role?: string) =>
    ({
      getClass: () => StaffPosController,
      getHandler: () => function handler() {},
      switchToHttp: () => ({
        getRequest: () => ({
          principal: role ? { user: { role } } : undefined,
        }),
      }),
    }) as never;

  it('allows STAFF and rejects CUSTOMER, ADMIN, or unauthenticated callers', () => {
    expect(guard.canActivate(context('STAFF'))).toBe(true);
    expect(() => guard.canActivate(context('CUSTOMER'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('ADMIN'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});

describe('PosService cash shift, counter payment, refund, and reconciliation rules', () => {
  function makeService(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cashShift: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      paymentEvent: {
        create: jest.fn(),
      },
      orderReservation: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      promotion: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      refund: {
        create: jest.fn(),
      },
      ...txOverrides,
    };
    const db = {
      order: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o1', status: 'PAID' }) },
      cashShift: { findFirst: jest.fn(), findMany: jest.fn() },
      payment: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    const inventory = {
      consume: jest.fn().mockResolvedValue({}),
      restoreSold: jest.fn().mockResolvedValue({}),
      release: jest.fn().mockResolvedValue({}),
      reserve: jest.fn().mockResolvedValue({}),
      validateSellableConfiguration: jest.fn(),
    };
    const commerce = {
      idem: jest.fn((_actor: string, _op: string, _key: string | undefined, _payload: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx)),
      settle: jest.fn(),
      inquire: jest.fn(),
    };
    const vnpay = { config: jest.fn(), url: jest.fn() };
    const service = new PosService(
      db as unknown as PrismaService,
      inventory as unknown as InventoryService,
      commerce as unknown as CommerceService,
      vnpay as unknown as VNPayService,
    );
    return { service, tx, db, inventory, commerce };
  }

  it('rejects coupon codes on walk-in counter orders', async () => {
    const { service } = makeService();
    await expect(
      service.createCounterOrder(
        'staff-1',
        {
          items: [
            {
              productId: '11111111-1111-4111-8111-111111111111',
              sizeId: '22222222-2222-4222-8222-222222222222',
              toppingIds: [],
              quantity: 1,
            },
          ],
          couponCode: 'BREW10',
        },
        'idem-no-promo',
      ),
    ).rejects.toThrow('không áp dụng mã giảm giá');
  });

  it('blocks opening a second concurrent cash shift for the same staff member', async () => {
    const { service, tx } = makeService();
    tx.cashShift.findFirst.mockResolvedValueOnce({ id: 'existing-shift' });
    await expect(
      service.openShift('staff-1', { openingFloat: 500000 }, 'idem-open-1'),
    ).rejects.toThrow('ca thu ngân đang mở');
    expect(tx.cashShift.create).not.toHaveBeenCalled();
  });

  it('rejects cash collection without an open shift or with insufficient cash tendered', async () => {
    const order = {
      id: 'pos-order-1',
      status: 'PENDING',
      version: 0,
      finalTotal: new D(69000),
      expiresAt: new Date(Date.now() + 300000),
      reservation: { state: 'HELD', expiresAt: new Date(Date.now() + 300000) },
      items: [{ sizeId: 'size-1', quantity: 1 }],
      payments: [],
      promotionId: null,
    };
    const { service, tx } = makeService();
    tx.order.findFirst.mockResolvedValue(order);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      service.payCounterOrder('staff-1', 'pos-order-1', { method: 'CASH', cashTendered: 100000 }, 'idem-cash-1'),
    ).rejects.toThrow('mở ca thu ngân');

    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'shift-1' }]);
    await expect(
      service.payCounterOrder('staff-1', 'pos-order-1', { method: 'CASH', cashTendered: 50000 }, 'idem-cash-2'),
    ).rejects.toThrow('nhỏ hơn tổng đơn');
  });

  it('records cash payment, exact change, consumes stock, and marks counter order PAID', async () => {
    const order = {
      id: 'pos-order-1',
      status: 'PENDING',
      version: 0,
      finalTotal: new D(69000),
      expiresAt: new Date(Date.now() + 300000),
      reservation: { state: 'HELD', expiresAt: new Date(Date.now() + 300000) },
      items: [{ sizeId: 'size-1', quantity: 2 }],
      payments: [],
      promotionId: null,
    };
    const { service, tx, inventory } = makeService();
    tx.order.findFirst.mockResolvedValueOnce(order);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.payment.create.mockResolvedValueOnce({ id: 'pay-cash-1', method: 'CASH', status: 'SUCCESS' });

    const res = await service.payCounterOrder(
      'staff-1',
      'pos-order-1',
      { method: 'CASH', cashTendered: 100000 },
      'idem-cash-ok',
    );
    expect(res).toHaveProperty('id', 'pay-cash-1');
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          method: 'CASH',
          status: 'SUCCESS',
          cashShiftId: 'shift-1',
          receivedByStaffId: 'staff-1',
          cashTendered: new D(100000),
          changeGiven: new D(31000),
        }),
      }),
    );
    expect(inventory.consume).toHaveBeenCalledWith(tx, 'size-1', 2);
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('requires a reason and an open shift to cancel and cash-refund a PAID counter order, and blocks PREPARING orders', async () => {
    const paidCashOrder = {
      id: 'pos-order-paid',
      status: 'PAID',
      version: 1,
      finalTotal: new D(45000),
      reservation: { state: 'CONSUMED' },
      items: [{ sizeId: 'size-1', quantity: 1 }],
      payments: [{ id: 'pay-1', method: 'CASH', status: 'SUCCESS', amount: new D(45000), providerPaymentId: 'cash:abc', refund: null }],
      promotionId: null,
    };
    const { service, tx, inventory } = makeService();
    tx.order.findFirst.mockResolvedValueOnce(paidCashOrder);
    await expect(
      service.cancelCounterOrder('staff-1', 'pos-order-paid', { expectedVersion: 1, reason: '' }, 'idem-cancel-1'),
    ).rejects.toThrow('lý do hủy');

    tx.order.findFirst.mockResolvedValueOnce({ ...paidCashOrder, status: 'PREPARING' });
    await expect(
      service.cancelCounterOrder('staff-1', 'pos-order-paid', { expectedVersion: 1, reason: 'Khách đổi ý' }, 'idem-cancel-2'),
    ).rejects.toThrow('sau khi đã bắt đầu pha chế');

    tx.order.findFirst.mockResolvedValueOnce(paidCashOrder);
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'shift-open' }]);
    tx.order.update.mockResolvedValueOnce({ id: 'pos-order-paid', status: 'CANCELLED' });
    const cancelled = await service.cancelCounterOrder(
      'staff-1',
      'pos-order-paid',
      { expectedVersion: 1, reason: 'Khách đổi ý ngay tại quầy' },
      'idem-cancel-3',
    );
    expect(cancelled).toHaveProperty('status', 'CANCELLED');
    expect(inventory.restoreSold).toHaveBeenCalledWith(tx, 'size-1', 1);
    expect(tx.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'CASH',
          cashShiftId: 'shift-open',
          reason: 'Khách đổi ý ngay tại quầy',
        }),
      }),
    );
  });

  it('requires an explanation note when counted cash differs from expected shift cash', async () => {
    const openShift = {
      id: 'shift-1',
      status: 'OPEN',
      openingFloat: new D(500000),
      expectedCash: null,
      countedCash: null,
      variance: null,
      closingNote: null,
      reconcileNote: null,
      openedAt: new Date(),
      closedAt: null,
      reconciledAt: null,
      staff: { id: 'staff-1', fullName: 'Staff', email: 'staff@brewlite.local' },
      reconciledByAdmin: null,
      payments: [{ id: 'p1', orderId: 'o1', amount: new D(100000), cashTendered: new D(100000), changeGiven: new D(0), createdAt: new Date(), order: { id: 'o1', orderCode: 'POS-1', guestLabel: 'Khách A', status: 'PAID' } }],
      refunds: [{ id: 'r1', paymentId: 'p2', amount: new D(30000), reason: 'Bấm nhầm', createdAt: new Date(), payment: { order: { id: 'o2', orderCode: 'POS-2', guestLabel: 'Khách B', status: 'CANCELLED' } } }],
    };
    const { service, tx } = makeService();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.cashShift.findUniqueOrThrow.mockResolvedValueOnce(openShift);
    // expected = 500000 + 100000 - 30000 = 570000; counted = 560000 => variance = -10000
    await expect(
      service.closeShift('staff-1', { countedCash: 560000, closingNote: '' }, 'idem-close-1'),
    ).rejects.toThrow('ghi chú giải trình');

    tx.$queryRaw.mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.cashShift.findUniqueOrThrow.mockResolvedValueOnce(openShift);
    tx.cashShift.update.mockResolvedValueOnce({
      ...openShift,
      status: 'CLOSED',
      expectedCash: new D(570000),
      countedCash: new D(570000),
      variance: new D(0),
      closedAt: new Date(),
    });
    const closed = await service.closeShift('staff-1', { countedCash: 570000 }, 'idem-close-2');
    expect(closed).toMatchObject({ status: 'CLOSED', expectedCash: '570000', countedCash: '570000', variance: '0' });
  });

  it('prevents Admin from reconciling an OPEN or already RECONCILED shift and locks CLOSED shifts once', async () => {
    const { service, tx } = makeService();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.cashShift.findUniqueOrThrow.mockResolvedValueOnce({ id: 'shift-1', status: 'OPEN' });
    await expect(service.adminReconcileShift('admin-1', 'shift-1', {}, 'idem-rec-1')).rejects.toThrow('vẫn đang mở');

    tx.$queryRaw.mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.cashShift.findUniqueOrThrow.mockResolvedValueOnce({ id: 'shift-1', status: 'RECONCILED' });
    await expect(service.adminReconcileShift('admin-1', 'shift-1', {}, 'idem-rec-2')).rejects.toThrow('đã được đối soát');

    tx.$queryRaw.mockResolvedValueOnce([{ id: 'shift-1' }]);
    tx.cashShift.findUniqueOrThrow.mockResolvedValueOnce({ id: 'shift-1', status: 'CLOSED' });
    tx.cashShift.update.mockResolvedValueOnce({
      id: 'shift-1',
      status: 'RECONCILED',
      openingFloat: new D(500000),
      expectedCash: new D(570000),
      countedCash: new D(570000),
      variance: new D(0),
      closingNote: null,
      reconcileNote: 'Đã thu đủ tiền mặt',
      openedAt: new Date(),
      closedAt: new Date(),
      reconciledAt: new Date(),
      staff: { id: 'staff-1', fullName: 'Staff', email: 'staff@brewlite.local' },
      reconciledByAdmin: { id: 'admin-1', fullName: 'Admin', email: 'admin@brewlite.local' },
      payments: [],
      refunds: [],
    });
    const reconciled = await service.adminReconcileShift('admin-1', 'shift-1', { note: 'Đã thu đủ tiền mặt' }, 'idem-rec-3');
    expect(reconciled).toMatchObject({ status: 'RECONCILED', reconcileNote: 'Đã thu đủ tiền mặt' });
  });
});
