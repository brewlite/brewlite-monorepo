ALTER TYPE "LoyaltyTransactionType" ADD VALUE 'EARN_REVERSAL';
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED','PENDING','SUCCESS','FAILED','UNKNOWN');
CREATE TABLE "refunds" (
 "id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "amount" DECIMAL(10,2) NOT NULL,
 "provider" TEXT NOT NULL, "status" "RefundStatus" NOT NULL,
 "providerRefundId" TEXT, "idempotencyKey" TEXT NOT NULL, "requestedBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
 CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0),
 CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "refunds_paymentId_key" ON "refunds"("paymentId");
CREATE UNIQUE INDEX "refunds_providerRefundId_key" ON "refunds"("providerRefundId");
CREATE UNIQUE INDEX "refunds_idempotencyKey_key" ON "refunds"("idempotencyKey");
