import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { InventoryService } from '../src/inventory/inventory.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CommerceService } from '../src/commerce/commerce.service';
import { vnDate } from '../src/commerce/vnpay.service';
import { spawn } from 'node:child_process';
import path from 'node:path';

(process.env.STAGE2_TEST_DATABASE_URL ? describe : describe.skip)('Stage2 Checkout/Order/VNPay controlled HTTP, dedicated DATABASE', () => {
  let app: INestApplication; let db: PrismaService; let commerce: CommerceService;
  let customers: { id: string; cookie: string }[]; let product: string; let size: string; let topping: string;
  const previousEnv = { ...process.env };
  const secret = randomBytes(32).toString('hex'); // Test-only signer, never merchant credentials.
  const originalFetch = globalThis.fetch;
  const noNetwork = async (): Promise<Response> => { throw new Error('External network forbidden in Stage2 tests'); };
  const queryFields = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo', 'vnp_PromotionCode', 'vnp_PromotionAmount'];
  function mockQuery(p: { providerPaymentId: string; amount: string }, overrides: Record<string, string> = {}, badSignature = false) {
    const raw: Record<string, string> = { vnp_ResponseId: randomUUID(), vnp_Command: 'querydr', vnp_ResponseCode: '00', vnp_Message: 'Fixture', vnp_TmnCode: 'STG2TEST', vnp_TxnRef: p.providerPaymentId.slice(6), vnp_Amount: (BigInt(p.amount) * 100n).toString(), vnp_TransactionNo: (BigInt('0x' + p.providerPaymentId.slice(-12)) + 1n).toString(), vnp_TransactionType: '01', vnp_TransactionStatus: '00', ...overrides };
    const signature = createHmac('sha512', secret).update(queryFields.map((key) => raw[key] ?? '').join('|')).digest('hex');
    globalThis.fetch = async () => new Response(JSON.stringify({ ...raw, vnp_SecureHash: badSignature ? '0'.repeat(128) : signature }));
  }
  async function snapshot(orderId: string, paymentId: string) {
    return {
      payment: await db.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      order: await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { history: true } }),
      reservation: await db.orderReservation.findUniqueOrThrow({ where: { orderId } }),
      stock: await db.size.findUniqueOrThrow({ where: { id: size } }),
      events: await db.paymentEvent.findMany({ where: { paymentId } }),
      notifications: await db.notification.count({ where: { orderId } }),
    };
  }
  const get = (url: string, actor = 0) => request(app.getHttpServer()).get(`/api${url}`).set('Cookie', customers[actor].cookie);
  const post = (url: string, body: object, key = randomUUID(), actor = 0) => request(app.getHttpServer()).post(`/api${url}`).set('Cookie', customers[actor].cookie).set('Origin', 'http://localhost:3000').set('Idempotency-Key', key).send(body);
  const item = (quantity = 1, note = '') => ({ productId: product, sizeId: size, toppingIds: [topping], quantity, note });
  async function order(actor = 0, couponCode = '', pointsUsed = 0) {
    const cart = (await get('/cart', actor).expect(200)).body;
    const quote = (await post('/cart/calculate', { items: cart.items.map((i: { quantity: number; note: string }) => item(i.quantity, i.note)), couponCode, pointsUsed }, randomUUID(), actor).expect(200)).body;
    const body = { cartVersion: cart.version, couponCode, pointsUsed, quoteFingerprint: quote.quoteFingerprint };
    return { body, key: randomUUID(), quote };
  }
  async function placed(actor = 0) {
    await post('/cart/items', item(), randomUUID(), actor).expect(201); const command = await order(actor);
    return (await post('/orders', command.body, command.key, actor).expect(201)).body;
  }
  async function payment(orderId: string) { return (await post(`/orders/${orderId}/payments`, { method: 'VNPAY' }).expect(201)).body; }
  function event(p: { providerPaymentId: string; amount: string }, response = '00', state = '00', override: Record<string, string> = {}) {
    const params = { vnp_TmnCode: 'STG2TEST', vnp_TxnRef: p.providerPaymentId.slice(6), vnp_Amount: (BigInt(p.amount) * 100n).toString(), vnp_ResponseCode: response, vnp_TransactionStatus: state, vnp_TransactionNo: (BigInt('0x' + p.providerPaymentId.slice(-12)) + 1n).toString(), ...override };
    // Independent test signer: do not call the implementation under test.
    const canonical = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))).toString();
    return { ...params, vnp_SecureHash: createHmac('sha512', secret).update(canonical).digest('hex') };
  }
  const ipn = (params: object) => request(app.getHttpServer()).get('/api/payments/vnpay/ipn').query(params);
  beforeAll(async () => {
    const testUrl = new URL(process.env.STAGE2_TEST_DATABASE_URL!);
    if (!/^\/brewlite_stage2_test_[a-zA-Z0-9_]+$/.test(testUrl.pathname) || testUrl.searchParams.get('schema') !== 'public') throw new Error('Dedicated Stage2 DATABASE required');
    process.env.DATABASE_URL = testUrl.toString(); process.env.VNPAY_TMN_CODE = 'STG2TEST'; process.env.VNPAY_HASH_SECRET = secret;
    process.env.VNPAY_RETURN_URL = 'http://localhost:3001/api/payments/vnpay/return';
    process.env.VNPAY_RECONCILE_ENABLED = 'false';
    globalThis.fetch = noNetwork;
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000,http://localhost:3100';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api'); app.enableCors({ origin: ['http://localhost:3000', 'http://localhost:3100'], credentials: true }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); await app.init();
    db = app.get(PrismaService); commerce = app.get(CommerceService);
    if ((await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`)[0].name !== testUrl.pathname.slice(1)) throw new Error('Refuse fixtures outside verified test database');
    customers = [];
    for (let i = 0; i < 2; i++) {
      const email = `${randomUUID()}@example.test`; const password = 'Stage2 isolated test password';
      const user = await db.user.create({ data: { email, fullName: 'Stage2 fixture', passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), loyaltyPoints: 100 } });
      const response = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', 'http://localhost:3000').send({ email, password }).expect(200);
      customers.push({ id: user.id, cookie: (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0] });
    }
  });
  beforeEach(async () => {
    for (let actor = 0; actor < 2; actor++) {
      const cart = (await get('/cart', actor).expect(200)).body;
      for (const line of cart.items) await request(app.getHttpServer()).delete(`/api/cart/items/${line.id}`).set('Cookie', customers[actor].cookie).set('Origin', 'http://localhost:3000').set('Idempotency-Key', randomUUID()).send({}).expect(200);
    }
    product = (await db.product.create({ data: { name: 'Stage2 fixture only', basePrice: '35000', stockQuantity: 999 } })).id;
    size = (await db.size.create({ data: { productId: product, name: 'M', extraPrice: '0', onHand: 20 } })).id;
    topping = (await db.topping.create({ data: { name: `Stage2 topping ${randomUUID()}`, price: '5000' } })).id;
  });
  afterEach(() => { globalThis.fetch = noNetwork; jest.restoreAllMocks(); });
  afterAll(async () => { await app?.close(); process.env = previousEnv; globalThis.fetch = originalFetch; });
  it('prices coupon/points, snapshots, holds resources and retries the same Order exactly once', async () => {
    const coupon = await db.promotion.create({ data: { code: randomUUID(), discountType: 'FIXED_AMOUNT', discountValue: '5000', minOrderValue: '10000', startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 3600000), usageLimit: 1 } });
    // Product policy normalizes coupon lookup to uppercase.
    await db.promotion.update({ where: { id: coupon.id }, data: { code: coupon.code.toUpperCase() } });
    await post('/cart/items', item()).expect(201); const command = await order(0, coupon.code, 10);
    const first = (await post('/orders', command.body, command.key).expect(201)).body;
    const again = (await post('/orders', command.body, command.key).expect(201)).body;
    expect(again.id).toBe(first.id); expect(first.status).toBe('PENDING_PAYMENT'); expect(first.finalTotal).toBe('34000'); expect(first.items[0].toppings[0].toppingName).toContain('Stage2 topping');
    expect((await db.size.findUniqueOrThrow({ where: { id: size } })).reserved).toBe(1);
    expect((await db.orderReservation.findUniqueOrThrow({ where: { orderId: first.id } })).state).toBe('HELD');
    expect(first.history).toHaveLength(1); expect(first.payments).toEqual([]);
    expect((await post('/orders', { ...command.body, pointsUsed: 11 }, command.key).expect(409)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const p = await payment(first.id); await ipn(event(p)); await ipn(event(p));
    expect(await db.promotion.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({ usedCount: 1, reservedCount: 0 });
    expect(await db.user.findUniqueOrThrow({ where: { id: customers[0].id } })).toMatchObject({ loyaltyPoints: 90, reservedPoints: 0 });
    expect(await db.loyaltyTransaction.count({ where: { orderId: first.id, type: 'REDEEM' } })).toBe(1);
  });
  it('prevents oversell when two customers compete for the final Size', async () => {
    await db.size.update({ where: { id: size }, data: { onHand: 1 } });
    await post('/cart/items', item()).expect(201); await post('/cart/items', item(), randomUUID(), 1).expect(201);
    const a = await order(0); const b = await order(1);
    const responses = await Promise.all([post('/orders', a.body, a.key), post('/orders', b.body, b.key, 1)]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await db.size.findUniqueOrThrow({ where: { id: size } })).toMatchObject({ onHand: 1, reserved: 1 });
  });
  it('reserves the final coupon quota for only one competing customer and rejects excessive points', async () => {
    const code = randomUUID().toUpperCase();
    await db.promotion.create({ data: { code, discountType: 'FIXED_AMOUNT', discountValue: '5000', startDate: new Date(Date.now() - 1000), endDate: new Date(Date.now() + 3600000), usageLimit: 1 } });
    await post('/cart/items', item()).expect(201); await post('/cart/items', item(), randomUUID(), 1).expect(201);
    await post('/cart/calculate', { items: [item()], pointsUsed: 10000 }).expect(422);
    const a = await order(0, code); const b = await order(1, code);
    const results = await Promise.all([post('/orders', a.body, a.key), post('/orders', b.body, b.key, 1)]);
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 422]);
    expect((await db.promotion.findUniqueOrThrow({ where: { code } })).reservedCount).toBe(1);
  });
  it('rechecks NULL stock, stale cart, changed price, invalid configuration and aggregate stock', async () => {
    await post('/cart/items', item()).expect(201); const command = await order();
    expect((await post('/orders', { ...command.body, cartVersion: command.body.cartVersion - 1 }).expect(409)).body.code).toBe('CART_CHANGED');
    await db.size.update({ where: { id: size }, data: { onHand: null } }); await post('/orders', command.body).expect(409);
    await db.size.update({ where: { id: size }, data: { onHand: 20 } });
    await db.product.update({ where: { id: product }, data: { basePrice: '36000' } });
    expect((await post('/orders', command.body).expect(409)).body.code).toBe('PRICE_CHANGED');
    await db.topping.update({ where: { id: topping }, data: { isAvailable: false } }); await post('/orders', command.body).expect(400);
    expect(await db.order.count({ where: { items: { some: { productId: product } } } })).toBe(0);
  });
  it('creates a signed Sandbox URL; Return does not mark PAID; IPN SUCCESS consumes once', async () => {
    const o = await placed(); const p = await payment(o.id); const params = event(p);
    expect(new URL(p.paymentUrl).hostname).toBe('sandbox.vnpayment.vn');
    await request(app.getHttpServer()).get('/api/payments/vnpay/return').query(params).expect(303);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PENDING_PAYMENT');
    await get(`/payments/${p.id}`).expect(200); await commerce.reconcile();
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).not.toBe('SUCCESS');
    const replies = await Promise.all([ipn(params), ipn(params)]); expect(replies.every((r) => ['00', '02'].includes(r.body.RspCode))).toBe(true);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: 'PAID' });
    expect(await db.size.findUniqueOrThrow({ where: { id: size } })).toMatchObject({ onHand: 19, reserved: 0 });
    expect(await db.paymentEvent.count({ where: { paymentId: p.id } })).toBe(1);
    expect((await get(`/orders/${o.id}`).expect(200)).body.history.at(-1).toStatus).toBe('PAID');
    await get(`/orders/${o.id}`, 1).expect(404); expect((await get('/orders').expect(200)).body.some((row: { id: string }) => row.id === o.id)).toBe(true);
  });
  it.each(['order', 'reservation'])('quarantines signed success after %s expiry without consuming stock', async (expired) => {
    const o = await placed(); const p = await payment(o.id);
    const past = new Date(Date.now() - 1000);
    if (expired === 'order') await db.order.update({ where: { id: o.id }, data: { expiresAt: past } });
    else await db.orderReservation.update({ where: { orderId: o.id }, data: { expiresAt: past } });
    const callback = event(p);
    expect((await ipn(callback)).body.RspCode).toBe('99');
    expect((await ipn(callback)).body.RspCode).toBe('99');
    expect(await db.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: 'UNKNOWN', failureReason: 'RECONCILIATION_REQUIRED' });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: 'PENDING_PAYMENT' });
    expect(await db.orderReservation.findUniqueOrThrow({ where: { orderId: o.id } })).toMatchObject({ state: 'HELD' });
    expect(await db.size.findUniqueOrThrow({ where: { id: size } })).toMatchObject({ onHand: 20, reserved: 1 });
    expect(await db.paymentEvent.count({ where: { paymentId: p.id, processingStatus: 'REQUIRES_REVIEW' } })).toBe(1);
  });
  it.each(['order', 'reservation'])('does not fulfill an expired %s even when signed PayDate is before expiry', async (expired) => {
    const o = await placed(); const p = await payment(o.id);
    const deadline = new Date(Date.now() - 1000);
    if (expired === 'order') await db.order.update({ where: { id: o.id }, data: { expiresAt: deadline } });
    else await db.orderReservation.update({ where: { orderId: o.id }, data: { expiresAt: deadline } });
    const before = await snapshot(o.id, p.id);
    const callback = event(p, '00', '00', { vnp_PayDate: vnDate(new Date(deadline.getTime() - 1000)) });
    expect((await ipn(callback)).body.RspCode).toBe('99');
    const after = await snapshot(o.id, p.id);
    expect(after.payment).toMatchObject({ status: 'UNKNOWN', failureReason: 'RECONCILIATION_REQUIRED' });
    expect(after.order).toEqual(before.order); expect(after.reservation).toEqual(before.reservation); expect(after.stock).toEqual(before.stock);
    expect(after.events).toHaveLength(1); expect(after.events[0].processingStatus).toBe('REQUIRES_REVIEW');
    await ipn(callback); expect(await snapshot(o.id, p.id)).toEqual(after);
  });
  it('rolls back payment, event, order, reservation and stock when inventory consumption fails, then retries once', async () => {
    const o = await placed(); const p = await payment(o.id); const before = await snapshot(o.id, p.id);
    const inventory = app.get(InventoryService); const consume = inventory.consume.bind(inventory);
    const failure = jest.spyOn(inventory, 'consume').mockImplementationOnce(async (tx, id, amount) => {
      await consume(tx, id, amount); // Fail after a real inventory mutation inside the transaction.
      throw new Error('Injected rollback after stock write');
    });
    const callback = event(p);
    expect((await ipn(callback)).body.RspCode).toBe('99');
    expect(await snapshot(o.id, p.id)).toEqual(before);
    failure.mockRestore();
    expect((await ipn(callback)).body.RspCode).toBe('00');
    const after = await snapshot(o.id, p.id);
    expect(after.payment.status).toBe('SUCCESS'); expect(after.order.status).toBe('PAID'); expect(after.reservation.state).toBe('CONSUMED');
    expect(after.stock).toMatchObject({ onHand: 19, reserved: 0 }); expect(after.events).toHaveLength(1);
    expect((await ipn(callback)).body.RspCode).toBe('02'); expect(await snapshot(o.id, p.id)).toEqual(after);
  });
  it.each(['success', 'failed', 'signature', 'amount', 'timeout', 'network'] as const)('reconciles mocked QueryDr %s through authenticated HTTP', async (scenario) => {
    const o = await placed(); const p = await payment(o.id); const before = await snapshot(o.id, p.id);
    mockQuery(p, scenario === 'failed' ? { vnp_TransactionStatus: '02' } : scenario === 'amount' ? { vnp_Amount: '1' } : {}, scenario === 'signature');
    if (scenario === 'timeout') globalThis.fetch = async () => { throw new DOMException('Fixture timeout', 'TimeoutError'); };
    if (scenario === 'network') globalThis.fetch = async () => { throw new TypeError('Fixture network failure'); };
    await post(`/payments/${p.id}/reconcile`, {}, randomUUID(), 1).expect(404);
    const response = (await post(`/payments/${p.id}/reconcile`, {}).expect(200)).body;
    const after = await snapshot(o.id, p.id);
    if (scenario === 'success') {
      expect(response.status).toBe('SUCCESS'); expect(after.order.status).toBe('PAID'); expect(after.reservation.state).toBe('CONSUMED');
      expect(after.stock).toMatchObject({ onHand: 19, reserved: 0 }); expect(after.events).toHaveLength(1);
      // A subsequent genuine callback must not consume inventory again.
      expect((await ipn(event(p))).body.RspCode).toBe('02'); expect(await snapshot(o.id, p.id)).toEqual(after);
    } else if (scenario === 'failed') {
      expect(response.status).toBe('FAILED'); expect(after.events).toHaveLength(1);
      expect(after.order).toEqual(before.order); expect(after.reservation).toEqual(before.reservation); expect(after.stock).toEqual(before.stock);
    } else {
      expect(response.status).toBe('UNKNOWN');
      expect(response.reconciliation.reason).toBe({ signature: 'INVALID_SIGNATURE', amount: 'AMOUNT_MISMATCH', timeout: 'TIMEOUT', network: 'NETWORK_ERROR' }[scenario]);
      expect(after.events).toEqual([]); expect(after.order).toEqual(before.order); expect(after.reservation).toEqual(before.reservation); expect(after.stock).toEqual(before.stock);
    }
    await post(`/payments/${p.id}/reconcile`, {}).expect(200); expect(await snapshot(o.id, p.id)).toEqual(after);
  });
  it.each(['order', 'reservation'])('keeps a verified QueryDr SUCCESS for expired %s in review', async (expired) => {
    const o = await placed(); const p = await payment(o.id); const deadline = new Date(Date.now() - 1000);
    if (expired === 'order') await db.order.update({ where: { id: o.id }, data: { expiresAt: deadline } });
    else await db.orderReservation.update({ where: { orderId: o.id }, data: { expiresAt: deadline } });
    const before = await snapshot(o.id, p.id);
    mockQuery(p, { vnp_PayDate: vnDate(new Date(deadline.getTime() - 1000)) });
    const response = (await post(`/payments/${p.id}/reconcile`, {}).expect(200)).body;
    expect(response).toMatchObject({ status: 'UNKNOWN', failureReason: 'RECONCILIATION_REQUIRED', reconciliation: { reason: 'VERIFIED' } });
    const after = await snapshot(o.id, p.id);
    expect(after.order).toEqual(before.order); expect(after.reservation).toEqual(before.reservation); expect(after.stock).toEqual(before.stock);
    expect(after.events).toHaveLength(1); expect(after.events[0]).toMatchObject({ outcome: 'SUCCESS', processingStatus: 'REQUIRES_REVIEW' });
    await post(`/payments/${p.id}/reconcile`, {}).expect(200); expect(await snapshot(o.id, p.id)).toEqual(after);
  });
  it('serializes racing QueryDr and IPN confirmations without double consumption', async () => {
    const o = await placed(); const p = await payment(o.id); mockQuery(p);
    await Promise.all([post(`/payments/${p.id}/reconcile`, {}).expect(200), ipn(event(p)).expect(200)]);
    const after = await snapshot(o.id, p.id);
    expect(after.payment.status).toBe('SUCCESS'); expect(after.order.status).toBe('PAID'); expect(after.reservation.state).toBe('CONSUMED');
    expect(after.stock).toMatchObject({ onHand: 19, reserved: 0 });
    expect(after.events.filter((e) => e.processingStatus === 'PROCESSED')).toHaveLength(1);
    expect(after.order.history.filter((h) => h.toStatus === 'PAID')).toHaveLength(1);
    expect(after.notifications).toBe(1);
    await ipn(event(p)); expect(await snapshot(o.id, p.id)).toEqual(after);
  });
  it('rolls back every settlement write when PostgreSQL rejects the final Payment update', async () => {
    const o = await placed(); const p = await payment(o.id); const before = await snapshot(o.id, p.id);
    // Test-only trigger in the verified isolated test database. It fails after
    // event, stock, notification, reservation, order and history writes occurred.
    await db.$executeRawUnsafe(`CREATE FUNCTION vnpay_test_reject_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status::text = 'SUCCESS' THEN RAISE EXCEPTION 'fixture final payment write failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe('CREATE TRIGGER vnpay_test_reject_success BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION vnpay_test_reject_success()');
      expect((await ipn(event(p))).body.RspCode).toBe('99');
      expect(await snapshot(o.id, p.id)).toEqual(before);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS vnpay_test_reject_success ON payments');
      await db.$executeRawUnsafe('DROP FUNCTION vnpay_test_reject_success()');
    }
    expect((await ipn(event(p))).body.RspCode).toBe('00');
    const after = await snapshot(o.id, p.id);
    expect(after.payment.status).toBe('SUCCESS'); expect(after.order.status).toBe('PAID'); expect(after.events).toHaveLength(1);
    expect(after.stock).toMatchObject({ onHand: 19, reserved: 0 }); expect(after.notifications).toBe(1);
  });
  it('rejects invalid signature, amount, merchant and unknown TxnRef without side effects', async () => {
    const o = await placed(); const p = await payment(o.id);
    expect((await ipn({ ...event(p), vnp_SecureHash: '0'.repeat(128) })).body.RspCode).toBe('97');
    expect((await ipn(event(p, '00', '00', { vnp_Amount: '1' }))).body.RspCode).toBe('04');
    expect((await ipn(event(p, '00', '00', { vnp_TmnCode: 'OTHER' }))).body.RspCode).toBe('97');
    expect((await ipn(event(p, '00', '00', { vnp_TxnRef: 'a'.repeat(32) }))).body.RspCode).toBe('01');
    expect(await db.paymentEvent.count({ where: { paymentId: p.id } })).toBe(0);
  });
  it('replays payment initiation without a second attempt and quarantines reused provider transaction IDs', async () => {
    const firstOrder = await placed(); const key = randomUUID();
    const p = (await post(`/orders/${firstOrder.id}/payments`, { method: 'VNPAY' }, key).expect(201)).body;
    const retry = (await post(`/orders/${firstOrder.id}/payments`, { method: 'VNPAY' }, key).expect(201)).body;
    expect(retry.id).toBe(p.id); expect(retry.paymentUrl).toBe(p.paymentUrl);
    const firstEvent = event(p); await ipn(firstEvent);
    const secondOrder = await placed(); const other = await payment(secondOrder.id);
    expect((await ipn(event(other, '00', '00', { vnp_TransactionNo: firstEvent.vnp_TransactionNo }))).body.RspCode).toBe('99');
    expect(await db.payment.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ status: 'UNKNOWN', failureReason: 'RECONCILIATION_REQUIRED' });
    expect((await db.order.findUniqueOrThrow({ where: { id: secondOrder.id } })).status).toBe('PENDING_PAYMENT');
  });
  it('UNKNOWN holds resources and blocks retry/cancel; later signed SUCCESS settles once', async () => {
    const o = await placed(); const p = await payment(o.id);
    expect((await ipn(event(p, '00', '01'))).body.RspCode).toBe('00');
    expect((await get(`/payments/${p.id}`).expect(200)).body.status).toBe('UNKNOWN');
    await post(`/orders/${o.id}/cancel`, {}).expect(409); await post(`/orders/${o.id}/payments`, { method: 'VNPAY' }).expect(409);
    await ipn(event(p)); expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('PAID');
  });
  it('FAILED preserves hold for retry/cancel, and duplicate callbacks do not release or consume twice', async () => {
    const o = await placed(); const p = await payment(o.id); const failed = event(p, '24', '02');
    expect((await ipn(failed)).body.RspCode).toBe('00'); expect((await ipn(failed)).body.RspCode).toBe('02');
    expect(await db.size.findUniqueOrThrow({ where: { id: size } })).toMatchObject({ onHand: 20, reserved: 1 });
    await post(`/orders/${o.id}/cancel`, {}).expect(200);
    expect(await db.size.findUniqueOrThrow({ where: { id: size } })).toMatchObject({ onHand: 20, reserved: 0 });
    expect((await ipn(event(p))).body.RspCode).toBe('99');
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('CANCELLED');
    expect(await db.paymentEvent.count({ where: { paymentId: p.id, processingStatus: 'REQUIRES_REVIEW' } })).toBe(1);
  });
  it('expires unpaid reservations idempotently; mock remains separate and cannot settle VNPay', async () => {
    const o = await placed();
    await db.orderReservation.update({ where: { orderId: o.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await commerce.reconcile(); await commerce.reconcile();
    expect((await db.orderReservation.findUniqueOrThrow({ where: { orderId: o.id } })).state).toBe('RELEASED');
    expect((await db.size.findUniqueOrThrow({ where: { id: size } })).reserved).toBe(0);
    const second = await placed(); const mock = (await post(`/orders/${second.id}/payments`, { method: 'CARD' }).expect(201)).body;
    expect(mock.status).toBe('SUCCESS'); expect(mock.providerPaymentId.startsWith('vnpay:')).toBe(false);
  });
  (process.env.STAGE2_BROWSER === '1' ? it : it.skip)('real Checkout UI → test Nest/PostgreSQL → controlled IPN → confirmed result and history', async () => {
    await app.listen(0); const address = app.getHttpServer().address() as { port: number };
    const user = await db.user.findUniqueOrThrow({ where: { id: customers[0].id } });
    const settings = { stage2: true, frontend: process.env.FRONTEND_E2E_URL, api: `http://localhost:${address.port}`, database: new URL(process.env.STAGE2_TEST_DATABASE_URL!).pathname.slice(1), productId: product, customer: user.email, password: 'Stage2 isolated test password', testSigner: secret };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [path.resolve('../../tests/p3-browser.cjs')], { env: { ...process.env, P3_BROWSER_SETTINGS: JSON.stringify(settings) }, windowsHide: true });
      child.stdout.on('data', (data: Buffer) => process.stdout.write(data)); child.stderr.on('data', (data: Buffer) => process.stderr.write(data)); child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Stage2 browser failed')));
    });
    const saved = await db.order.findFirstOrThrow({ where: { items: { some: { productId: product } } }, include: { items: { include: { toppings: true } }, reservation: true, payments: true } });
    expect(saved.status).toBe('PAID'); expect(saved.items[0].note).toBe('Stage2 browser note'); expect(saved.items[0].toppings).toHaveLength(1); expect(saved.reservation?.state).toBe('CONSUMED');
    expect(saved.payments[0].status).toBe('SUCCESS'); expect((await db.size.findUniqueOrThrow({ where: { id: size } })).onHand).toBe(19);
  }, 150000);
});
