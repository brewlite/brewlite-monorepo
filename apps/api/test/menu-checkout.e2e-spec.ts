import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const enabled = Boolean(process.env.AUTH_TEST_DATABASE_URL);

(enabled ? describe : describe.skip)(
    'Menu to order confirmation',
    () => {
        let app: INestApplication;
        let db: PrismaService;
        let cookie: string;
        let productId: string;
        let sizeId: string;
        let customerId: string;

        const password = 'Menu checkout isolated test password';

        beforeAll(async () => {
            const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
            if (!databaseUrl) {
                throw new Error('AUTH_TEST_DATABASE_URL is required.');
            }

            const testUrl = new URL(databaseUrl);
            const schema = testUrl.searchParams.get('schema');

            if (!schema?.startsWith('brewlite_auth_test_')) {
                throw new Error('A dedicated brewlite_auth_test schema is required.');
            }

            process.env.DATABASE_URL = testUrl.toString();

            const module = await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

            app = module.createNestApplication();
            app.use(cookieParser());
            app.setGlobalPrefix('api');
            app.useGlobalPipes(
                new ValidationPipe({ whitelist: true, transform: true }),
            );
            await app.init();

            db = app.get(PrismaService);

            const email = `${randomUUID()}@example.test`;
            const customer = await db.user.create({
                data: {
                    fullName: 'Menu checkout test customer',
                    email,
                    passwordHash: await bcrypt.hash(password, 4),
                    emailVerifiedAt: new Date(),
                },
            });
            customerId = customer.id;

            const login = await request(app.getHttpServer())
                .post('/api/auth/login')
                .set('Origin', 'http://localhost:3000')
                .send({ email, password })
                .expect(200);

            const cookies = login.headers['set-cookie'] as unknown as string[];
            cookie = cookies[0].split(';')[0];

            const product = await db.product.create({
                data: {
                    name: 'Menu checkout test product',
                    basePrice: '36000',
                    stockQuantity: 10,
                },
            });
            productId = product.id;

            const size = await db.size.create({
                data: {
                    productId,
                    name: 'M',
                    extraPrice: '0',
                    onHand: 5,
                },
            });
            sizeId = size.id;
        });

        afterAll(async () => {
            await app?.close();
        });

        it('loads a menu product and creates a confirmed order from the cart', async () => {
            const menu = await request(app.getHttpServer())
                .get('/api/products')
                .expect(200);

            expect(menu.body).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: productId,
                        name: 'Menu checkout test product',
                    }),
                ]),
            );

            await request(app.getHttpServer())
                .post('/api/cart/items')
                .set('Cookie', cookie)
                .set('Origin', 'http://localhost:3000')
                .set('Idempotency-Key', randomUUID())
                .send({
                    productId,
                    sizeId,
                    toppingIds: [],
                    quantity: 1,
                })
                .expect(201);

            const cartResponse = await request(app.getHttpServer())
                .get('/api/cart')
                .set('Cookie', cookie)
                .expect(200);

            const cart = cartResponse.body;

            const quoteResponse = await request(app.getHttpServer())
                .post('/api/cart/calculate')
                .set('Cookie', cookie)
                .set('Origin', 'http://localhost:3000')
                .send({
                    items: [
                        {
                            productId,
                            sizeId,
                            toppingIds: [],
                            quantity: 1,
                        },
                    ],
                })
                .expect(200);

            const orderResponse = await request(app.getHttpServer())
                .post('/api/orders')
                .set('Cookie', cookie)
                .set('Origin', 'http://localhost:3000')
                .set('Idempotency-Key', randomUUID())
                .send({
                    cartVersion: cart.version,
                    couponCode: '',
                    pointsUsed: 0,
                    quoteFingerprint: quoteResponse.body.quoteFingerprint,
                })
                .expect(201);

            expect(orderResponse.body).toMatchObject({
                userId: customerId,
                status: 'PENDING_PAYMENT',
            });

            const reservation = await db.orderReservation.findUniqueOrThrow({
                where: { orderId: orderResponse.body.id },
            });

            expect(reservation.state).toBe('HELD');

            const size = await db.size.findUniqueOrThrow({
                where: { id: sizeId },
            });

            expect(size.reserved).toBe(1);

            const finalCart = await request(app.getHttpServer())
                .get('/api/cart')
                .set('Cookie', cookie)
                .expect(200);

            expect(finalCart.body.items).toHaveLength(0);
        });
    },
);