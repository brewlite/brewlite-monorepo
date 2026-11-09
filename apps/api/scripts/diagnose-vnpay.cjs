// Read-only database diagnostic. --query contacts Sandbox but never settles payment.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const { VNPayService } = require('../dist/commerce/vnpay.service');
const db = new PrismaClient();
async function read(id) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.payment.findUniqueOrThrow({ where: { id }, select: {
      id: true, orderId: true, status: true, amount: true, createdAt: true,
      providerPaymentId: true, failureReason: true, _count: { select: { events: true } },
      order: { select: { status: true, expiresAt: true, isLegacy: true } },
    } });
  });
}
async function main() {
  const id = process.argv[2];
  if (!id || !/^[a-f0-9-]{36}$/i.test(id) || process.argv.slice(3).some((arg) => arg !== '--query')) throw new Error('Usage: node scripts/diagnose-vnpay.cjs PAYMENT_UUID [--query]');
  const payment = await read(id);
  if (payment.order.isLegacy || !payment.providerPaymentId?.startsWith('vnpay:')) throw new Error('Not a non-legacy VNPay payment');
  console.log(JSON.stringify({ paymentId: payment.id, orderId: payment.orderId, paymentStatus: payment.status, orderStatus: payment.order.status, amount: payment.amount.toFixed(0), createdAt: payment.createdAt, paymentEvents: payment._count.events, automaticReconciliationEnabled: process.env.VNPAY_RECONCILE_ENABLED === 'true' }));
  if (!process.argv.includes('--query')) return;
  const service = new VNPayService();
  let diagnostic = { reason: 'NO_VERIFIED_RESULT' };
  const result = await service.query(payment.providerPaymentId.slice(6), payment.createdAt, payment.amount.toFixed(0), (report) => { diagnostic = report; });
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const after = await read(id);
  console.log(JSON.stringify({ diagnostic, verifiedProviderOutcome: result?.outcome ?? null, databaseSnapshotUnchanged: hash(payment) === hash(after), note: 'Diagnostic only: no settlement, no order/payment/event writes. Snapshot changes may come from concurrent callbacks.' }));
}
main().catch(() => { console.error('Diagnostic failed. Check payment ID, database access and compiled API; no credentials or raw provider payload are printed.'); process.exitCode = 1; }).finally(() => db.$disconnect());
