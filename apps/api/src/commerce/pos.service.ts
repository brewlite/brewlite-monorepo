import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CommerceService, integer, record, text } from './commerce.service';
import { VNPayService } from './vnpay.service';

const D = Prisma.Decimal;

const posOrderInclude = {
  items: { include: { toppings: true } },
  payments: {
    include: {
      refund: true,
      receivedByStaff: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  reservation: true,
  createdByStaff: { select: { id: true, fullName: true, email: true } },
  history: {
    include: {
      actor: { select: { id: true, fullName: true, email: true, role: true } },
    },
    orderBy: { orderVersion: 'asc' as const },
  },
};

const shiftDetailInclude = {
  staff: { select: { id: true, fullName: true, email: true } },
  reconciledByAdmin: { select: { id: true, fullName: true, email: true } },
  payments: {
    where: { method: 'CASH' as const, status: 'SUCCESS' as const },
    include: {
      order: { select: { id: true, orderCode: true, guestLabel: true, status: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  refunds: {
    where: { provider: 'CASH', status: 'SUCCESS' as const },
    include: {
      payment: {
        select: {
          order: { select: { id: true, orderCode: true, guestLabel: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

function fail(code: string, message: string, status = 400): never {
  const body = { code, message };
  if (status === 409) throw new ConflictException(body);
  if (status === 404) throw new NotFoundException(body);
  if (status === 422) throw new UnprocessableEntityException(body);
  throw new BadRequestException(body);
}

type PosInput = {
  productId: string;
  sizeId: string;
  toppingIds: string[];
  quantity: number;
  note: string;
};

function parsePosItem(value: unknown): PosInput {
  const o = record(value);
  const productId = text(o.productId, 80);
  const sizeId = text(o.sizeId, 80);
  const ids = o.toppingIds ?? [];
  if (
    !productId ||
    !sizeId ||
    !Array.isArray(ids) ||
    ids.length > 30 ||
    ids.some((id) => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  ) {
    fail('INVALID_OPTIONS', 'Tùy chọn sản phẩm không hợp lệ.');
  }
  return {
    productId,
    sizeId,
    toppingIds: (ids as string[]).slice().sort(),
    quantity: integer(o.quantity, 1, 20),
    note: text(o.note ?? '', 200),
  };
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, value) => acc.plus(value), new D(0));
}

@Injectable()
export class PosService {
  constructor(
    private readonly db: PrismaService,
    private readonly inventory: InventoryService,
    private readonly commerce: CommerceService,
    private readonly vnpay: VNPayService,
  ) {}

  private serializeShift(
    shift: Prisma.CashShiftGetPayload<{ include: typeof shiftDetailInclude }>,
    includeExpectedWhenOpen = true,
  ) {
    const cashCollected = sumDecimals(shift.payments.map((p) => p.amount));
    const cashRefunded = sumDecimals(shift.refunds.map((r) => r.amount));
    const netCash = cashCollected.minus(cashRefunded);
    const liveExpected = shift.openingFloat.plus(netCash);
    const expected = shift.expectedCash ?? (includeExpectedWhenOpen ? liveExpected : null);
    return {
      id: shift.id,
      status: shift.status,
      staff: shift.staff,
      reconciledByAdmin: shift.reconciledByAdmin,
      openingFloat: shift.openingFloat.toFixed(0),
      cashCollected: cashCollected.toFixed(0),
      cashRefunded: cashRefunded.toFixed(0),
      netCash: netCash.toFixed(0),
      expectedCash: expected ? expected.toFixed(0) : null,
      countedCash: shift.countedCash ? shift.countedCash.toFixed(0) : null,
      variance: shift.variance ? shift.variance.toFixed(0) : null,
      closingNote: shift.closingNote,
      reconcileNote: shift.reconcileNote,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      reconciledAt: shift.reconciledAt,
      cashPaymentCount: shift.payments.length,
      cashRefundCount: shift.refunds.length,
      payments: shift.payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderCode: p.order.orderCode,
        guestLabel: p.order.guestLabel,
        orderStatus: p.order.status,
        amount: p.amount.toFixed(0),
        cashTendered: p.cashTendered?.toFixed(0) ?? null,
        changeGiven: p.changeGiven?.toFixed(0) ?? null,
        createdAt: p.createdAt,
      })),
      refunds: shift.refunds.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        orderId: r.payment.order.id,
        orderCode: r.payment.order.orderCode,
        guestLabel: r.payment.order.guestLabel,
        amount: r.amount.toFixed(0),
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    };
  }

  async currentShift(staffId: string) {
    const [openShift, recentShifts] = await Promise.all([
      this.db.cashShift.findFirst({
        where: { staffId, status: 'OPEN' },
        include: shiftDetailInclude,
      }),
      this.db.cashShift.findMany({
        where: { staffId },
        include: shiftDetailInclude,
        orderBy: { openedAt: 'desc' },
        take: 10,
      }),
    ]);

    let qrPaidCount = 0;
    let qrCollected = new D(0);
    if (openShift) {
      const nonCash = await this.db.payment.findMany({
        where: {
          status: 'SUCCESS',
          method: { not: 'CASH' },
          receivedByStaffId: staffId,
          createdAt: { gte: openShift.openedAt },
          order: { channel: 'COUNTER_POS', isLegacy: false },
          refund: null,
        },
        select: { amount: true },
      });
      qrPaidCount = nonCash.length;
      qrCollected = sumDecimals(nonCash.map((row) => row.amount));
    }

    return {
      // Blind-count discipline on the active shift: omit expectedCash while OPEN so staff counts real cash.
      current: openShift
        ? {
            ...this.serializeShift(openShift, false),
            qrPaidCount,
            qrCollected: qrCollected.toFixed(0),
          }
        : null,
      history: recentShifts
        .filter((s) => s.status !== 'OPEN')
        .map((s) => this.serializeShift(s, true)),
    };
  }

  async openShift(staffId: string, body: unknown, key?: string) {
    const b = record(body);
    const openingFloat = integer(b.openingFloat ?? 0, 0, 50_000_000);
    return this.commerce.idem(
      staffId,
      'pos.shift.open',
      key,
      { openingFloat },
      async (tx) => {
        const existing = await tx.cashShift.findFirst({
          where: { staffId, status: 'OPEN' },
          select: { id: true },
        });
        if (existing) {
          fail(
            'SHIFT_ALREADY_OPEN',
            'Bạn đang có một ca thu ngân đang mở. Hãy đóng ca hiện tại trước.',
            409,
          );
        }
        const created = await tx.cashShift.create({
          data: {
            staffId,
            openingFloat: new D(openingFloat),
            status: 'OPEN',
          },
          include: shiftDetailInclude,
        });
        return this.serializeShift(created, false);
      },
    );
  }

  async closeShift(staffId: string, body: unknown, key?: string) {
    const b = record(body);
    const countedCash = integer(b.countedCash, 0, 500_000_000);
    const closingNote = text(b.closingNote ?? '', 300);
    return this.commerce.idem(
      staffId,
      'pos.shift.close',
      key,
      { countedCash, closingNote },
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM cash_shifts WHERE "staffId" = ${staffId} AND status = 'OPEN' FOR UPDATE
        `;
        if (!rows.length) {
          fail('NO_OPEN_SHIFT', 'Không có ca thu ngân nào đang mở.', 404);
        }
        const shift = await tx.cashShift.findUniqueOrThrow({
          where: { id: rows[0].id },
          include: shiftDetailInclude,
        });
        const cashIn = sumDecimals(shift.payments.map((p) => p.amount));
        const cashOut = sumDecimals(shift.refunds.map((r) => r.amount));
        const expectedCash = shift.openingFloat.plus(cashIn).minus(cashOut);
        const counted = new D(countedCash);
        const variance = counted.minus(expectedCash);
        if (!variance.isZero() && closingNote.length < 3) {
          fail(
            'VARIANCE_NOTE_REQUIRED',
            `Két tiền lệch ${variance.gt(0) ? '+' : ''}${variance.toFixed(0)}đ so với sổ sách (${expectedCash.toFixed(0)}đ). Vui lòng nhập ghi chú giải trình trước khi đóng ca.`,
            400,
          );
        }
        const closed = await tx.cashShift.update({
          where: { id: shift.id },
          data: {
            status: 'CLOSED',
            expectedCash,
            countedCash: counted,
            variance,
            closingNote: closingNote || null,
            closedAt: new Date(),
          },
          include: shiftDetailInclude,
        });
        return this.serializeShift(closed, true);
      },
    );
  }

  async listCounterOrders() {
    return this.db.order.findMany({
      where: { isLegacy: false, channel: 'COUNTER_POS' },
      include: posOrderInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createCounterOrder(staffId: string, body: unknown, key?: string) {
    const b = record(body);
    const rawItems = Array.isArray(b.items) ? b.items : [];
    if (!rawItems.length || rawItems.length > 50) {
      fail('EMPTY_ORDER', 'Vui lòng chọn ít nhất 1 món (tối đa 50 dòng).');
    }
    const items = rawItems.map(parsePosItem);
    const guestLabel = text(b.guestLabel ?? '', 60) || 'Khách tại quầy';
    const couponCode = text(b.couponCode ?? '', 40).toUpperCase();
    if (couponCode) {
      fail(
        'COUNTER_POS_NO_PROMO',
        'Đơn bán tại quầy không áp dụng mã giảm giá hay điểm thưởng.',
        400,
      );
    }
    const note = text(b.note ?? '', 200);

    return this.commerce.idem(
      staffId,
      'pos.order.create',
      key,
      { items, guestLabel, couponCode, note },
      async (tx) => {
        const amounts = new Map<string, number>();
        let subtotal = new D(0);
        const lines: {
          productId: string;
          sizeId: string;
          productName: string;
          sizeName: string;
          unitPrice: Prisma.Decimal;
          quantity: number;
          lineTotal: Prisma.Decimal;
          note: string | null;
          toppings: { toppingName: string; price: Prisma.Decimal }[];
        }[] = [];

        for (const item of items) {
          const { product, size, toppings } =
            await this.inventory.validateSellableConfiguration(item, tx);
          amounts.set(size.id, (amounts.get(size.id) ?? 0) + item.quantity);
          if ((amounts.get(size.id) ?? 0) > size.availableQuantity!) {
            fail(
              'OUT_OF_STOCK',
              `Không đủ tồn cho ${product.name} (${size.name}).`,
              409,
            );
          }
          const toppingTotal = toppings.reduce(
            (sum, t) => sum.plus(t.price),
            new D(0),
          );
          const unitPrice = product.basePrice
            .plus(size.extraPrice)
            .plus(toppingTotal);
          const lineTotal = unitPrice.times(item.quantity);
          subtotal = subtotal.plus(lineTotal);
          lines.push({
            productId: product.id,
            sizeId: size.id,
            productName: product.name,
            sizeName: size.name,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
            note: item.note || null,
            toppings: toppings.map((t) => ({
              toppingName: t.name,
              price: t.price,
            })),
          });
        }

        if (subtotal.lte(0)) {
          fail('INVALID_TOTAL', 'Tổng thanh toán phải lớn hơn 0.', 422);
        }

        for (const [sizeId, qty] of [...amounts].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          await this.inventory.reserve(tx, sizeId, qty);
        }

        const expiresAt = new Date(Date.now() + 600_000);
        return tx.order.create({
          data: {
            orderCode: `POS-${Date.now()}-${randomUUID().slice(0, 6)}`,
            userId: null,
            isLegacy: false,
            channel: 'COUNTER_POS',
            createdByStaffId: staffId,
            guestLabel,
            status: 'PENDING',
            subtotal,
            discountAmount: new D(0),
            pointsUsed: 0,
            pointsDiscount: new D(0),
            finalTotal: subtotal,
            note: note || null,
            promotionId: null,
            couponCodeSnapshot: null,
            expiresAt,
            reservation: { create: { state: 'HELD', expiresAt, pointsReserved: 0 } },
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                sizeId: line.sizeId,
                productName: line.productName,
                sizeName: line.sizeName,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
                note: line.note,
                toppings: { create: line.toppings },
              })),
            },
            history: {
              create: {
                fromStatus: null,
                toStatus: 'PENDING',
                actorId: staffId,
                orderVersion: 0,
              },
            },
          },
          include: posOrderInclude,
        });
      },
    );
  }

  async payCounterOrder(
    staffId: string,
    orderId: string,
    body: unknown,
    key?: string,
    clientIp = '127.0.0.1',
  ) {
    const b = record(body);
    const method = text(b.method, 20);
    if (!['CASH', 'VNPAY', 'WALLET', 'CARD'].includes(method)) {
      fail('INVALID_METHOD', 'Phương thức thanh toán tại quầy không hợp lệ.');
    }
    const cashTendered =
      method === 'CASH' ? integer(b.cashTendered, 1, 500_000_000) : undefined;
    if (method === 'VNPAY') this.vnpay.config();
    else if (
      ['WALLET', 'CARD'].includes(method) &&
      process.env.NODE_ENV !== 'test' &&
      process.env.ENABLE_MOCK_PAYMENTS !== 'true'
    ) {
      fail('MOCK_DISABLED', 'Thanh toán mô phỏng chưa được bật cho môi trường này.');
    }

    const created = await this.commerce.idem(
      staffId,
      'pos.payment.create',
      key,
      { orderId, method, ...(cashTendered !== undefined ? { cashTendered } : {}) },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const o = await tx.order.findFirst({
          where: {
            id: orderId,
            isLegacy: false,
            channel: 'COUNTER_POS',
            userId: null,
          },
          include: { items: true, payments: true, reservation: true },
        });
        if (!o) {
          fail(
            'NOT_FOUND',
            'Không tìm thấy đơn tại quầy (nhân viên không được thu hộ đơn khách đặt trên App).',
            404,
          );
        }
        const now = new Date();
        if (
          !['PENDING', 'PAYMENT_FAILED'].includes(o.status) ||
          !o.expiresAt ||
          o.expiresAt.getTime() <= now.getTime() ||
          !o.reservation ||
          o.reservation.state !== 'HELD' ||
          o.reservation.expiresAt.getTime() <= now.getTime()
        ) {
          fail('PAYMENT_EXPIRED', 'Đơn đã hết hạn giữ tồn cho thanh toán.', 409);
        }
        if (
          o.payments.length >= 3 ||
          o.payments.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status))
        ) {
          fail(
            'INVALID_PAYMENT_STATE',
            'Không thể tạo thêm lần thanh toán cho đơn này.',
            409,
          );
        }
        if (!o.finalTotal.isInteger() || o.finalTotal.lte(0)) {
          fail('INVALID_PAYMENT_AMOUNT', 'Số tiền thanh toán không hợp lệ.');
        }

        if (method === 'CASH') {
          const shiftRows = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM cash_shifts WHERE "staffId" = ${staffId} AND status = 'OPEN' FOR UPDATE
          `;
          if (!shiftRows.length) {
            fail(
              'SHIFT_REQUIRED',
              'Vui lòng mở ca thu ngân trước khi thu tiền mặt.',
              409,
            );
          }
          const shiftId = shiftRows[0].id;
          const tendered = new D(cashTendered!);
          if (tendered.lt(o.finalTotal)) {
            fail(
              'INSUFFICIENT_CASH',
              `Tiền khách đưa (${tendered.toFixed(0)}đ) nhỏ hơn tổng đơn (${o.finalTotal.toFixed(0)}đ).`,
              400,
            );
          }
          const changeGiven = tendered.minus(o.finalTotal);
          const providerId = `cash:${randomUUID()}`;
          const payment = await tx.payment.create({
            data: {
              orderId: o.id,
              method: 'CASH',
              amount: o.finalTotal,
              attemptNumber: o.payments.length + 1,
              providerPaymentId: providerId,
              status: 'SUCCESS',
              cashShiftId: shiftId,
              receivedByStaffId: staffId,
              cashTendered: tendered,
              changeGiven,
              paidAt: now,
              resolvedAt: now,
            },
          });
          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              providerEventId: `${providerId}:final`,
              outcome: 'SUCCESS',
              amount: o.finalTotal,
              processingStatus: 'PROCESSED',
              processedAt: now,
              metadata: {
                source: 'counter_cash',
                staffId,
                cashShiftId: shiftId,
                cashTendered: tendered.toFixed(0),
                changeGiven: changeGiven.toFixed(0),
              },
            },
          });
          const quantities = new Map<string, number>();
          for (const item of o.items) {
            if (item.sizeId) {
              quantities.set(
                item.sizeId,
                (quantities.get(item.sizeId) ?? 0) + item.quantity,
              );
            }
          }
          for (const [sizeId, qty] of [...quantities].sort(([a], [b]) =>
            a.localeCompare(b),
          )) {
            await this.inventory.consume(tx, sizeId, qty);
          }
          if (o.promotionId) {
            await tx.promotion.update({
              where: { id: o.promotionId },
              data: {
                reservedCount: { decrement: 1 },
                usedCount: { increment: 1 },
              },
            });
          }
          await tx.orderReservation.update({
            where: { orderId: o.id },
            data: { state: 'CONSUMED', consumedAt: now },
          });
          await tx.order.update({
            where: { id: o.id },
            data: {
              status: 'PAID',
              version: { increment: 1 },
              history: {
                create: {
                  fromStatus: o.status,
                  toStatus: 'PAID',
                  actorId: staffId,
                  orderVersion: o.version + 1,
                },
              },
            },
          });
          return payment;
        }

        if (o.status === 'PAYMENT_FAILED') {
          await tx.order.update({
            where: { id: o.id },
            data: {
              status: 'PENDING',
              version: { increment: 1 },
              history: {
                create: {
                  fromStatus: 'PAYMENT_FAILED',
                  toStatus: 'PENDING',
                  actorId: staffId,
                  orderVersion: o.version + 1,
                },
              },
            },
          });
        }
        return tx.payment.create({
          data: {
            orderId: o.id,
            method: method === 'VNPAY' ? 'CARD' : (method as 'WALLET' | 'CARD'),
            amount: o.finalTotal,
            attemptNumber: o.payments.length + 1,
            providerPaymentId:
              method === 'VNPAY'
                ? `vnpay:${randomUUID().replace(/-/g, '')}`
                : randomUUID(),
            status: method === 'VNPAY' ? 'PENDING' : 'UNKNOWN',
            receivedByStaffId: staffId,
          },
        });
      },
    );

    const p = record(created);
    const paymentId = String(p.id);
    if (method === 'CASH') {
      const order = await this.db.order.findUniqueOrThrow({
        where: { id: orderId },
        include: posOrderInclude,
      });
      return { ...p, order };
    }
    if (method === 'VNPAY') {
      const fresh = await this.db.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { order: { include: { reservation: true } } },
      });
      if (fresh.status !== 'PENDING' && fresh.status !== 'UNKNOWN') return fresh;
      const orderExpiry = fresh.order.expiresAt?.getTime() ?? 0;
      const holdExpiry =
        fresh.order.reservation?.state === 'HELD'
          ? fresh.order.reservation.expiresAt.getTime()
          : 0;
      if (!orderExpiry || !holdExpiry || Math.min(orderExpiry, holdExpiry) <= Date.now()) {
        fail('PAYMENT_EXPIRED', 'Đã hết hạn thanh toán.', 409);
      }
      return {
        ...fresh,
        order: undefined,
        paymentUrl: this.vnpay.url(
          fresh.providerPaymentId!.slice(6),
          fresh.amount.toFixed(0),
          fresh.createdAt,
          new Date(Math.min(orderExpiry, holdExpiry)),
          clientIp,
          'VNPAYQR',
        ),
      };
    }
    const settled = await this.commerce.settle(paymentId);
    const order = await this.db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: posOrderInclude,
    });
    return { ...settled, order };
  }

  async reconcileCounterPayment(paymentId: string) {
    const payment = await this.db.payment.findFirst({
      where: {
        id: paymentId,
        order: { isLegacy: false, channel: 'COUNTER_POS', userId: null },
      },
      select: { id: true },
    });
    if (!payment) fail('NOT_FOUND', 'Không tìm thấy giao dịch tại quầy.', 404);
    return this.commerce.inquire('', paymentId);
  }

  async cancelCounterOrder(
    staffId: string,
    orderId: string,
    body: unknown,
    key?: string,
  ) {
    const b = record(body);
    const expectedVersion =
      b.expectedVersion === undefined ? undefined : integer(b.expectedVersion);
    const reason = text(b.reason ?? '', 200);

    return this.commerce.idem(
      staffId,
      'pos.order.cancel',
      key,
      { orderId, expectedVersion, reason },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const o = await tx.order.findFirst({
          where: {
            id: orderId,
            isLegacy: false,
            channel: 'COUNTER_POS',
            userId: null,
          },
          include: {
            items: true,
            payments: { include: { refund: true } },
            reservation: true,
          },
        });
        if (!o) {
          fail('NOT_FOUND', 'Không tìm thấy đơn tại quầy.', 404);
        }
        if (expectedVersion !== undefined && o.version !== expectedVersion) {
          fail('ORDER_CHANGED', 'Đơn đã thay đổi. Vui lòng tải lại.', 409);
        }

        if (o.status === 'PENDING' || o.status === 'PAYMENT_FAILED') {
          if (!o.reservation || o.reservation.state !== 'HELD') {
            fail('INVALID_STATE', 'Đơn không thể hủy.', 409);
          }
          if (o.payments.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status))) {
            fail(
              'PAYMENT_UNRESOLVED',
              'Đang xác minh thanh toán, chưa thể hủy.',
              409,
            );
          }
          await tx.orderReservation.updateMany({
            where: { orderId: o.id, state: 'HELD' },
            data: { state: 'RELEASED', releasedAt: new Date() },
          });
          const quantities = new Map<string, number>();
          for (const item of o.items) {
            if (item.sizeId) {
              quantities.set(
                item.sizeId,
                (quantities.get(item.sizeId) ?? 0) + item.quantity,
              );
            }
          }
          for (const [sizeId, qty] of [...quantities].sort(([a], [b]) =>
            a.localeCompare(b),
          )) {
            await this.inventory.release(tx, sizeId, qty);
          }
          if (o.promotionId) {
            await tx.promotion.update({
              where: { id: o.promotionId },
              data: { reservedCount: { decrement: 1 } },
            });
          }
          return tx.order.update({
            where: { id: o.id },
            data: {
              status: 'CANCELLED',
              version: { increment: 1 },
              history: {
                create: {
                  fromStatus: o.status,
                  toStatus: 'CANCELLED',
                  actorId: staffId,
                  orderVersion: o.version + 1,
                },
              },
            },
            include: posOrderInclude,
          });
        }

        if (o.status === 'PAID') {
          if (expectedVersion === undefined) {
            fail('VERSION_REQUIRED', 'Vui lòng tải lại đơn trước khi hủy.', 409);
          }
          if (reason.length < 3) {
            fail(
              'CANCEL_REASON_REQUIRED',
              'Vui lòng nhập lý do hủy đơn đã thanh toán (tối thiểu 3 ký tự).',
              400,
            );
          }
          if (o.reservation?.state !== 'CONSUMED') {
            fail('INVALID_STATE', 'Chỉ có thể hủy đơn đã thanh toán và chưa pha chế.', 409);
          }
          if (o.payments.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status))) {
            fail('PAYMENT_UNRESOLVED', 'Đang xác minh thanh toán.', 409);
          }
          const successes = o.payments.filter((p) => p.status === 'SUCCESS');
          if (successes.length !== 1) {
            fail('REFUND_RECONCILIATION_REQUIRED', 'Cần đối soát thanh toán trước khi hủy.', 409);
          }
          const payment = successes[0];
          if (payment.providerPaymentId?.startsWith('vnpay:')) {
            fail(
              'EXTERNAL_REFUND_UNSUPPORTED',
              'Chưa hỗ trợ hủy và hoàn tiền VNPay trực tuyến. Vui lòng liên hệ quản trị đối soát.',
              409,
            );
          }
          if (payment.refund || !payment.amount.equals(o.finalTotal)) {
            fail('REFUND_RECONCILIATION_REQUIRED', 'Cần đối soát thanh toán trước khi hủy.', 409);
          }

          let refundShiftId: string | null = null;
          let refundProvider = 'MOCK';
          let refundPrefix = 'mock-refund';
          if (payment.method === 'CASH') {
            const shiftRows = await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM cash_shifts WHERE "staffId" = ${staffId} AND status = 'OPEN' FOR UPDATE
            `;
            if (!shiftRows.length) {
              fail(
                'SHIFT_REQUIRED',
                'Cần mở ca thu ngân để ghi nhận khoản hoàn tiền mặt tại két.',
                409,
              );
            }
            refundShiftId = shiftRows[0].id;
            refundProvider = 'CASH';
            refundPrefix = 'cash-refund';
          }

          const quantities = new Map<string, number>();
          for (const item of o.items) {
            if (!item.sizeId) {
              fail('REFUND_RECONCILIATION_REQUIRED', 'Đơn thiếu cấu hình tồn kho để hoàn trả.', 409);
            }
            quantities.set(
              item.sizeId,
              (quantities.get(item.sizeId) ?? 0) + item.quantity,
            );
          }
          for (const [sizeId, qty] of [...quantities].sort(([a], [b]) =>
            a.localeCompare(b),
          )) {
            await this.inventory.restoreSold(tx, sizeId, qty);
          }
          if (o.promotionId) {
            const restored = await tx.promotion.updateMany({
              where: { id: o.promotionId, usedCount: { gte: 1 } },
              data: { usedCount: { decrement: 1 } },
            });
            if (!restored.count) {
              fail('REFUND_RECONCILIATION_REQUIRED', 'Cần đối soát lượt mã giảm giá.', 409);
            }
          }
          await tx.refund.create({
            data: {
              paymentId: payment.id,
              amount: payment.amount,
              provider: refundProvider,
              status: 'SUCCESS',
              providerRefundId: `${refundPrefix}:${payment.id}`,
              idempotencyKey: `${refundPrefix}:${payment.id}`,
              requestedBy: staffId,
              cashShiftId: refundShiftId,
              reason,
              resolvedAt: new Date(),
            },
          });
          return tx.order.update({
            where: { id: o.id },
            data: {
              status: 'CANCELLED',
              version: { increment: 1 },
              history: {
                create: {
                  fromStatus: 'PAID',
                  toStatus: 'CANCELLED',
                  actorId: staffId,
                  orderVersion: o.version + 1,
                },
              },
            },
            include: posOrderInclude,
          });
        }

        fail(
          'INVALID_STATE',
          'Không thể hủy đơn sau khi đã bắt đầu pha chế hoặc đã kết thúc.',
          409,
        );
      },
    );
  }

  async adminCashShifts() {
    const fulfilledStatuses: OrderStatus[] = ['PAID', 'PREPARING', 'READY', 'COMPLETED'];
    const [shifts, fulfilledOrders] = await Promise.all([
      this.db.cashShift.findMany({
        include: shiftDetailInclude,
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
      this.db.order.findMany({
        where: { isLegacy: false, status: { in: fulfilledStatuses } },
        select: {
          channel: true,
          finalTotal: true,
          payments: {
            where: { status: 'SUCCESS' },
            select: { method: true },
          },
        },
      }),
    ]);

    let cashRevenue = new D(0);
    let cashOrders = 0;
    let posNonCashRevenue = new D(0);
    let posNonCashOrders = 0;
    let appOnlineRevenue = new D(0);
    let appOnlineOrders = 0;

    for (const order of fulfilledOrders) {
      const paidByCash = order.payments.some((p) => p.method === 'CASH');
      if (paidByCash) {
        cashRevenue = cashRevenue.plus(order.finalTotal);
        cashOrders += 1;
      } else if (order.channel === 'COUNTER_POS') {
        posNonCashRevenue = posNonCashRevenue.plus(order.finalTotal);
        posNonCashOrders += 1;
      } else {
        appOnlineRevenue = appOnlineRevenue.plus(order.finalTotal);
        appOnlineOrders += 1;
      }
    }

    const serialized = shifts.map((s) => this.serializeShift(s, true));
    let pendingCashToCollect = new D(0);
    let reconciledCashTotal = new D(0);
    let totalVariance = new D(0);
    let openShiftsCount = 0;
    let closedPendingCount = 0;
    let reconciledCount = 0;

    for (const shift of shifts) {
      if (shift.status === 'OPEN') {
        openShiftsCount += 1;
      } else if (shift.status === 'CLOSED') {
        closedPendingCount += 1;
        if (shift.countedCash) pendingCashToCollect = pendingCashToCollect.plus(shift.countedCash);
        if (shift.variance) totalVariance = totalVariance.plus(shift.variance);
      } else if (shift.status === 'RECONCILED') {
        reconciledCount += 1;
        if (shift.countedCash) reconciledCashTotal = reconciledCashTotal.plus(shift.countedCash);
        if (shift.variance) totalVariance = totalVariance.plus(shift.variance);
      }
    }

    return {
      summary: {
        cashRevenue: cashRevenue.toFixed(0),
        cashOrders,
        posNonCashRevenue: posNonCashRevenue.toFixed(0),
        posNonCashOrders,
        appOnlineRevenue: appOnlineRevenue.toFixed(0),
        appOnlineOrders,
        pendingCashToCollect: pendingCashToCollect.toFixed(0),
        reconciledCashTotal: reconciledCashTotal.toFixed(0),
        totalVariance: totalVariance.toFixed(0),
        openShiftsCount,
        closedPendingCount,
        reconciledCount,
      },
      shifts: serialized,
    };
  }

  async adminReconcileShift(
    adminId: string,
    shiftId: string,
    body: unknown,
    key?: string,
  ) {
    const b = record(body);
    const note = text(b.note ?? '', 300);
    return this.commerce.idem(
      adminId,
      'admin.shift.reconcile',
      key,
      { shiftId, note },
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM cash_shifts WHERE id = ${shiftId} FOR UPDATE
        `;
        if (!rows.length) {
          fail('NOT_FOUND', 'Không tìm thấy ca thu ngân.', 404);
        }
        const current = await tx.cashShift.findUniqueOrThrow({
          where: { id: shiftId },
        });
        if (current.status === 'OPEN') {
          fail(
            'SHIFT_STILL_OPEN',
            'Ca thu ngân vẫn đang mở. Nhân viên phải đóng ca và đếm két trước khi đối soát.',
            409,
          );
        }
        if (current.status === 'RECONCILED') {
          fail('SHIFT_ALREADY_RECONCILED', 'Ca thu ngân này đã được đối soát khóa sổ trước đó.', 409);
        }
        const updated = await tx.cashShift.update({
          where: { id: shiftId },
          data: {
            status: 'RECONCILED',
            reconciledByAdminId: adminId,
            reconciledAt: new Date(),
            reconcileNote: note || null,
          },
          include: shiftDetailInclude,
        });
        return this.serializeShift(updated, true);
      },
    );
  }
}
