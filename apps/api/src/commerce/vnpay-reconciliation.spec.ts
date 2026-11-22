import { CommerceService } from './commerce.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { VNPayService } from './vnpay.service';
import { Prisma } from '@prisma/client';

describe('VNPay reconciliation after a provider outage', () => {
  afterEach(() => jest.restoreAllMocks());

  function fixture() {
    const payment = { id: 'payment', providerPaymentId: `vnpay:${'a'.repeat(32)}`, status: 'UNKNOWN', createdAt: new Date(), amount: new Prisma.Decimal(45000) };
    const db = { payment: {
      findFirst: jest.fn().mockResolvedValue(payment),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(payment),
    } };
    const query = jest.fn().mockImplementation((_ref, _date, _amount, diagnostic: (value: { reason: string; signatureVerified: boolean }) => void) => {
      diagnostic({ reason: 'TIMEOUT', signatureVerified: false });
      return Promise.resolve(null);
    });
    const service = new CommerceService(db as unknown as PrismaService, {} as InventoryService, { query } as unknown as VNPayService);
    return { service, query, db };
  }

  it('still queries after ten timeouts and settles only when verified evidence returns', async () => {
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { service, query, db } = fixture();
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await service.inquire('owner', 'payment');
      expect(result.status).toBe('UNKNOWN');
      expect(result).toHaveProperty('reconciliation.reason', 'TIMEOUT');
      now += 300000;
    }
    const settled = { status: 'SUCCESS' };
    const settle = jest.spyOn(service as unknown as { settleVerified: (...args: unknown[]) => Promise<unknown> }, 'settleVerified').mockResolvedValue(settled);
    query.mockResolvedValueOnce({ outcome: 'SUCCESS', params: { vnp_ResponseId: 'verified-response', vnp_TransactionNo: '123', vnp_TransactionStatus: '00' } });
    expect(await service.inquire('owner', 'payment')).toHaveProperty('status', 'SUCCESS');
    expect(query).toHaveBeenCalledTimes(11);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(db.payment.updateMany).toHaveBeenCalledTimes(10);
  });

  it('enforces the five minute cooldown for concurrent callers and permits retry at its boundary', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const { service, query } = fixture();
    const results = await Promise.all([service.inquire('owner', 'payment'), service.inquire('owner', 'payment')]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(results.some(result => 'reconciliation' in result && result.reconciliation?.reason === 'RATE_LIMITED')).toBe(true);
    now = 299999;
    expect(await service.inquire('owner', 'payment')).toHaveProperty('reconciliation.retryAfterSeconds', 1);
    now = 300000;
    await service.inquire('owner', 'payment');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not query a payment outside the caller ownership scope', async () => {
    const { service, query, db } = fixture();
    db.payment.findFirst.mockResolvedValueOnce(null);
    await expect(service.inquire('other-user', 'payment')).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    expect(db.payment.findFirst).toHaveBeenCalledWith({ where: { id: 'payment', order: { userId: 'other-user', isLegacy: false } } });
  });
});

describe('VNPay verified return settlement policy', () => {
  const previousEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...previousEnv };
    jest.restoreAllMocks();
  });

  function returnFixture() {
    const ref = 'b'.repeat(32);
    const payment = { id: 'pay-return', providerPaymentId: `vnpay:${ref}`, status: 'PENDING', createdAt: new Date(), amount: new Prisma.Decimal(49600) };
    const db = { payment: { findUnique: jest.fn().mockResolvedValue(payment) } };
    const verifiedParams = { vnp_TmnCode: 'TESTONLY', vnp_TxnRef: ref, vnp_Amount: '4960000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_TransactionNo: '14422574', vnp_PayDate: '20261122195930' };
    const vnpay = {
      verify: jest.fn().mockReturnValue(verifiedParams),
      outcome: jest.fn().mockReturnValue('SUCCESS'),
      logReturn: jest.fn(),
    };
    const service = new CommerceService(db as unknown as PrismaService, {} as InventoryService, vnpay as unknown as VNPayService);
    const settle = jest.spyOn(service as unknown as { settleVerified: (...args: unknown[]) => Promise<unknown> }, 'settleVerified').mockResolvedValue({ ...payment, status: 'SUCCESS' });
    return { service, db, vnpay, settle, ref, payment, verifiedParams };
  }

  it('keeps browser Return navigation-only by default', async () => {
    delete process.env.VNPAY_SETTLE_ON_RETURN;
    const { service, settle } = returnFixture();
    expect(await service.vnpayReturn({ vnp_TxnRef: 'b'.repeat(32) })).toBe('pay-return');
    expect(settle).not.toHaveBeenCalled();
  });

  it('settles verified Return payload via the same deterministic IPN event key when VNPAY_SETTLE_ON_RETURN=true', async () => {
    process.env.VNPAY_SETTLE_ON_RETURN = 'true';
    const { service, settle, ref, vnpay } = returnFixture();
    expect(await service.vnpayReturn({ vnp_TxnRef: ref })).toBe('pay-return');
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(
      'pay-return',
      'SUCCESS',
      `vnpay:${ref}:14422574:00:00`,
      '14422574',
      expect.objectContaining({ source: 'return', responseCode: '00', transactionStatus: '00' }),
      expect.any(Date),
    );
    vnpay.verify.mockReturnValueOnce(null);
    expect(await service.vnpayReturn({ tampered: '1' })).toBeNull();
    expect(settle).toHaveBeenCalledTimes(1);
  });
});
