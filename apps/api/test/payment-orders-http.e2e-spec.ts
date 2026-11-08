import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PaymentsModule } from '../src/payments/payments.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockPaymentService } from '../src/payments/mock-payment.service';

const secret = 'test-only-payment-orders-secret-at-least-32-bytes';
describe('Legacy payment/orders modules (isolated contract, not production AppModule)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let gateway: MockPaymentService;
  let customer: string;
  let other: string;
  let staff: string;
  let manager: string;
  let orderId: string;
  let fixtureUsers: string[] = [];
  const originalSecret = process.env.JWT_SECRET;
  const originalIssuer = process.env.JWT_ISSUER;
  const originalAudience = process.env.JWT_AUDIENCE;

  const token = (id: string, role: UserRole = UserRole.CUSTOMER) =>
    sign({ tokenUse: 'access', role }, secret, {
      subject: id,
      expiresIn: '15m',
    });
  const pay = (
    key = randomUUID(),
    method: PaymentMethod = PaymentMethod.WALLET,
  ) =>
    request(app.getHttpServer())
      .post('/api/payments')
      .auth(token(customer), { type: 'bearer' })
      .send({ orderId, method, idempotencyKey: key });
  const update = (
    expectedStatus: OrderStatus,
    status: OrderStatus,
    id = staff,
  ) =>
    request(app.getHttpServer())
      .patch(`/api/staff/orders/${orderId}/status`)
      .auth(token(id), { type: 'bearer' })
      .send({ expectedStatus, status });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.pathname !== '/brewlite_payment_test' ||
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    ) {
      throw new Error(
        'Only the local brewlite_payment_test database is allowed.',
      );
    }
    process.env.JWT_SECRET = secret;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    const module = await Test.createTestingModule({
      imports: [PrismaModule, PaymentsModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    db = app.get(PrismaService);
    gateway = app.get(MockPaymentService);
  });

  beforeEach(async () => {
    fixtureUsers = [];
    for (const role of [
      UserRole.CUSTOMER,
      UserRole.CUSTOMER,
      UserRole.STAFF,
      UserRole.MANAGER,
    ]) {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          fullName: 'HTTP test fixture',
          email: `${id}@example.test`,
          passwordHash: 'not-a-login-password',
          role,
        },
      });
      fixtureUsers.push(id);
    }
    [customer, other, staff, manager] = fixtureUsers;
    orderId = randomUUID();
    await db.order.create({
      data: {
        id: orderId,
        userId: customer,
        orderCode: `HTTP-${randomUUID()}`,
        subtotal: '45000',
        finalTotal: '45000',
      },
    });
    jest.spyOn(gateway, 'pay').mockImplementation(() => ({
      success: true,
      transactionRef: `MOCK-${randomUUID()}`,
    }));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (db && fixtureUsers.length) {
      await db.order.deleteMany({ where: { userId: { in: fixtureUsers } } });
      await db.user.deleteMany({ where: { id: { in: fixtureUsers } } });
    }
  });
  afterAll(async () => {
    if (app) await app.close();
    for (const [name, value] of Object.entries({
      JWT_SECRET: originalSecret,
      JWT_ISSUER: originalIssuer,
      JWT_AUDIENCE: originalAudience,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it.each([PaymentMethod.WALLET, PaymentMethod.CARD])(
    'confirms %s using the stored amount, with paid order and one audit event',
    async (method) => {
      const res = await pay(randomUUID(), method).expect(200);
      expect(res.body.payment).toMatchObject({
        status: 'SUCCESS',
        method,
        amount: '45000',
      });
      expect(res.body.order).toMatchObject({
        id: orderId,
        status: 'PAID',
        finalTotal: '45000',
      });
      expect(res.body.order.orderCode).toMatch(/^HTTP-/);
      expect(res.body.order.statusEvents).toHaveLength(1);
      expect(await db.notification.count({ where: { userId: customer } })).toBe(
        1,
      );
    },
  );

  it('replays the same payment exactly once, including concurrent requests', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([pay(key), pay(key)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.payment.id).toBe(b.body.payment.id);
    await pay(key).expect(200);
    await pay(key, PaymentMethod.CARD).expect(409);
    await pay().expect(400);
    expect(await db.payment.count({ where: { orderId } })).toBe(1);
    expect(await db.orderStatusEvent.count({ where: { orderId } })).toBe(1);
    expect(await db.notification.count({ where: { userId: customer } })).toBe(
      1,
    );
  });

  it('returns failed payment without confirming order; new key can retry', async () => {
    jest
      .spyOn(gateway, 'pay')
      .mockReturnValue({ success: false, failureReason: 'Test decline' });
    const key = randomUUID();
    const fail = await pay(key).expect(200);
    expect(fail.body.payment.status).toBe('FAILED');
    expect(fail.body.order.status).toBe('PENDING_PAYMENT');
    expect(await db.orderStatusEvent.count({ where: { orderId } })).toBe(0);
    expect(await db.notification.count({ where: { userId: customer } })).toBe(
      0,
    );
    jest
      .spyOn(gateway, 'pay')
      .mockReturnValue({ success: true, transactionRef: 'mock-retry' });
    const replay = await pay(key).expect(200);
    expect(replay.body.payment.id).toBe(fail.body.payment.id);
    expect(replay.body.payment.status).toBe('FAILED');
    await pay().expect(200);
    expect(
      await db.payment.count({
        where: { orderId, status: PaymentStatus.SUCCESS },
      }),
    ).toBe(1);
  });

  it('rejects missing, malformed, wrong-signature, expired and refresh tokens', async () => {
    const badTokens = [
      'invalid',
      sign({ tokenUse: 'access' }, 'wrong-secret', {
        subject: customer,
        expiresIn: '15m',
      }),
      sign({ tokenUse: 'access' }, secret, {
        subject: customer,
        expiresIn: -1,
      }),
      sign({ tokenUse: 'refresh' }, secret, {
        subject: customer,
        expiresIn: '1d',
      }),
      sign({}, secret, { subject: customer, expiresIn: '15m' }),
      sign({ tokenUse: 'access' }, secret, { subject: customer }),
      token(randomUUID()),
      sign({ tokenUse: 'access' }, secret, {
        subject: customer,
        expiresIn: '15m',
        algorithm: 'HS384',
      }),
    ];
    await request(app.getHttpServer()).get('/api/orders').expect(401);
    for (const jwt of badTokens) {
      await request(app.getHttpServer())
        .get('/api/orders')
        .auth(jwt, { type: 'bearer' })
        .expect(401);
    }
  });

  it('honors issuer/audience configuration and fails closed without a safe secret', async () => {
    try {
      process.env.JWT_ISSUER = 'brewlite';
      process.env.JWT_AUDIENCE = 'brewlite-api';
      await request(app.getHttpServer())
        .get('/api/orders')
        .auth(token(customer), { type: 'bearer' })
        .expect(401);
      const valid = sign({ tokenUse: 'access' }, secret, {
        subject: customer,
        expiresIn: '15m',
        issuer: 'brewlite',
        audience: 'brewlite-api',
      });
      await request(app.getHttpServer())
        .get('/api/orders')
        .auth(valid, { type: 'bearer' })
        .expect(200);
      delete process.env.JWT_SECRET;
      await request(app.getHttpServer())
        .get('/api/orders')
        .auth(valid, { type: 'bearer' })
        .expect(503);
    } finally {
      process.env.JWT_SECRET = secret;
      delete process.env.JWT_ISSUER;
      delete process.env.JWT_AUDIENCE;
    }
  });

  it('enforces DTOs, path UUID and bounded pagination', async () => {
    await request(app.getHttpServer())
      .post('/api/payments')
      .auth(token(customer), { type: 'bearer' })
      .send({ orderId, method: 'CASH', idempotencyKey: 'bad' })
      .expect(400);
    for (const query of [
      'page=0',
      'page=1.5',
      'limit=101',
      'limit=0',
      'status=UNKNOWN',
    ]) {
      await request(app.getHttpServer())
        .get(`/api/orders?${query}`)
        .auth(token(customer), { type: 'bearer' })
        .expect(400);
    }
    await request(app.getHttpServer())
      .get('/api/orders/not-a-uuid')
      .auth(token(customer), { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/staff/orders/${orderId}/status`)
      .auth(token(staff), { type: 'bearer' })
      .send({ status: 'COMPLETED' })
      .expect(400);
  });

  it('cannot impersonate a user, read or pay another customer order', async () => {
    await request(app.getHttpServer())
      .post('/api/payments')
      .auth(token(other), { type: 'bearer' })
      .send({
        orderId,
        method: 'CARD',
        idempotencyKey: randomUUID(),
        userId: customer,
      })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .auth(token(other), { type: 'bearer' })
      .expect(404);
    const list = await request(app.getHttpServer())
      .get(`/api/orders?userId=${customer}`)
      .auth(token(other), { type: 'bearer' })
      .expect(200);
    expect(list.body.total).toBe(0);
    const payment = await request(app.getHttpServer())
      .post('/api/payments')
      .auth(token(customer), { type: 'bearer' })
      .send({
        orderId,
        method: 'CARD',
        idempotencyKey: randomUUID(),
        amount: 1,
      })
      .expect(200);
    expect(payment.body.payment.amount).toBe('45000');
  });

  it('lists only owned orders with status filtering and deterministic newest-first pagination', async () => {
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: new Date('2020-01-01') },
    });
    const newer = await db.order.create({
      data: {
        userId: customer,
        orderCode: `HTTP-${randomUUID()}`,
        subtotal: 100,
        finalTotal: 100,
        status: 'PAID',
      },
    });
    await db.order.create({
      data: {
        userId: other,
        orderCode: `HTTP-${randomUUID()}`,
        subtotal: 100,
        finalTotal: 100,
      },
    });
    const first = await request(app.getHttpServer())
      .get('/api/orders?limit=1')
      .auth(token(customer), { type: 'bearer' })
      .expect(200);
    expect(first.body).toMatchObject({
      total: 2,
      totalPages: 2,
      page: 1,
      limit: 1,
    });
    expect(first.body.items[0].id).toBe(newer.id);
    const second = await request(app.getHttpServer())
      .get('/api/orders?limit=1&page=2')
      .auth(token(customer), { type: 'bearer' })
      .expect(200);
    expect(second.body.items[0].id).toBe(orderId);
    const paid = await request(app.getHttpServer())
      .get('/api/orders?status=PAID')
      .auth(token(customer), { type: 'bearer' })
      .expect(200);
    expect(paid.body.total).toBe(1);
  });

  it('uses database role, hides unpaid orders, and allows staff/manager after payment', async () => {
    await request(app.getHttpServer())
      .get('/api/staff/orders')
      .auth(token(customer, UserRole.MANAGER), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/staff/orders/${orderId}`)
      .auth(token(staff), { type: 'bearer' })
      .expect(404);
    await pay().expect(200);
    for (const id of [staff, manager]) {
      const list = await request(app.getHttpServer())
        .get('/api/staff/orders?status=PAID')
        .auth(token(id), { type: 'bearer' })
        .expect(200);
      expect(
        list.body.items.some((item: { id: string }) => item.id === orderId),
      ).toBe(true);
      await request(app.getHttpServer())
        .get(`/api/staff/orders/${orderId}`)
        .auth(token(id), { type: 'bearer' })
        .expect(200);
    }
    const pending = await request(app.getHttpServer())
      .get('/api/staff/orders?status=PENDING_PAYMENT')
      .auth(token(staff), { type: 'bearer' })
      .expect(200);
    expect(pending.body.total).toBe(0);
    await db.user.update({
      where: { id: staff },
      data: { role: UserRole.CUSTOMER },
    });
    await request(app.getHttpServer())
      .get('/api/staff/orders')
      .auth(token(staff, UserRole.STAFF), { type: 'bearer' })
      .expect(403);
  });

  it('transitions in sequence, rejects jumps/stale updates, and replays without duplicate effects', async () => {
    await pay().expect(200);
    await update(OrderStatus.PAID, OrderStatus.READY).expect(409);
    await update(OrderStatus.PAID, OrderStatus.PREPARING, customer).expect(403);
    await update(OrderStatus.PAID, OrderStatus.PREPARING).expect(200);
    await update(OrderStatus.PAID, OrderStatus.PREPARING).expect(200);
    await update(OrderStatus.PREPARING, OrderStatus.READY, manager).expect(200);
    await update(OrderStatus.PAID, OrderStatus.PREPARING).expect(409);
    await update(OrderStatus.READY, OrderStatus.COMPLETED).expect(200);
    await update(OrderStatus.READY, OrderStatus.COMPLETED).expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}`)
      .auth(token(customer), { type: 'bearer' })
      .expect(200);
    expect(detail.body.status).toBe('COMPLETED');
    expect(
      detail.body.statusEvents.map(
        (event: { toStatus: string }) => event.toStatus,
      ),
    ).toEqual(['PAID', 'PREPARING', 'READY', 'COMPLETED']);
    expect(await db.notification.count({ where: { userId: customer } })).toBe(
      4,
    );
    const events = await db.orderStatusEvent.findMany({ where: { orderId } });
    expect(events.every((event) => Boolean(event.actorId))).toBe(true);
  });

  it('concurrent staff updates produce one status event and one notification', async () => {
    await pay().expect(200);
    const results = await Promise.all([
      update(OrderStatus.PAID, OrderStatus.PREPARING),
      update(OrderStatus.PAID, OrderStatus.PREPARING, manager),
    ]);
    expect(results.some((result) => result.status === 200)).toBe(true);
    expect(results.every((result) => [200, 409].includes(result.status))).toBe(
      true,
    );
    expect(
      await db.orderStatusEvent.count({
        where: { orderId, toStatus: 'PREPARING' },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: customer, type: 'ORDER_STATUS_UPDATED' },
      }),
    ).toBe(1);
  });

  it('keeps snapshots when the catalog changes', async () => {
    const productId = randomUUID();
    try {
      await db.product.create({
        data: { id: productId, name: 'Original coffee', basePrice: 40000 },
      });
      await db.orderItem.create({
        data: {
          orderId,
          productId,
          productName: 'Original coffee',
          sizeName: 'M',
          unitPrice: 45000,
          quantity: 1,
          lineTotal: 45000,
          toppings: {
            create: { toppingName: 'Original topping', price: 5000 },
          },
        },
      });
      await db.product.update({
        where: { id: productId },
        data: { name: 'New coffee', basePrice: 90000 },
      });
      const res = await pay().expect(200);
      expect(res.body.order.items[0]).toMatchObject({
        productName: 'Original coffee',
        sizeName: 'M',
        unitPrice: '45000',
        lineTotal: '45000',
      });
      expect(res.body.order.items[0].toppings[0]).toMatchObject({
        toppingName: 'Original topping',
        price: '5000',
      });
      expect(res.body.order.finalTotal).toBe('45000');
    } finally {
      await db.orderItem.deleteMany({ where: { orderId } });
      await db.product.deleteMany({ where: { id: productId } });
    }
  });

  it('rejects cancelled, missing and negative-total orders', async () => {
    await db.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
    await pay().expect(400);
    await db.order.update({
      where: { id: orderId },
      data: { status: 'PENDING_PAYMENT', finalTotal: -1 },
    });
    await pay().expect(400);
    await request(app.getHttpServer())
      .post('/api/payments')
      .auth(token(customer), { type: 'bearer' })
      .send({
        orderId: randomUUID(),
        method: 'WALLET',
        idempotencyKey: randomUUID(),
      })
      .expect(404);
    expect(await db.payment.count({ where: { orderId } })).toBe(0);
  });

  it('rolls back a staff transition when notification storage fails', async () => {
    await pay().expect(200);
    const original = db.$transaction.bind(db);
    const transactionSpy = jest.spyOn(db, '$transaction').mockImplementation(((
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      original(async (tx) =>
        callback(
          new Proxy(tx, {
            get(target, prop) {
              if (prop === 'notification')
                return {
                  create: () => {
                    throw new Error('Injected notification write failure');
                  },
                };
              return Reflect.get(target, prop);
            },
          }),
        ),
      )) as typeof db.$transaction);
    try {
      await update(OrderStatus.PAID, OrderStatus.PREPARING).expect(500);
    } finally {
      transactionSpy.mockRestore();
    }
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('PAID');
    expect(await db.orderStatusEvent.count({ where: { orderId } })).toBe(1);
    expect(await db.notification.count({ where: { userId: customer } })).toBe(
      1,
    );
  });

  it('rolls back payment and order status when notification storage fails', async () => {
    const original = db.$transaction.bind(db);
    const transactionSpy = jest.spyOn(db, '$transaction').mockImplementation(((
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) =>
      original(
        async (tx) => {
          const proxy = new Proxy(tx, {
            get(target, prop) {
              if (prop === 'notification')
                return {
                  create: () => {
                    throw new Error('Injected notification write failure');
                  },
                };
              return Reflect.get(target, prop);
            },
          });
          return callback(proxy);
        },
        options as { isolationLevel: Prisma.TransactionIsolationLevel },
      )) as typeof db.$transaction);
    try {
      await pay().expect(500);
    } finally {
      transactionSpy.mockRestore();
    }
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('PENDING_PAYMENT');
    expect(await db.payment.count({ where: { orderId } })).toBe(0);
    expect(await db.orderStatusEvent.count({ where: { orderId } })).toBe(0);
  });
});
