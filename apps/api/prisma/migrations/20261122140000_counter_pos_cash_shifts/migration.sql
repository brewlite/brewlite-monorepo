ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CASH';

CREATE TYPE "OrderChannel" AS ENUM ('CUSTOMER_APP', 'COUNTER_POS');
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

CREATE TABLE "cash_shifts" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openingFloat" DECIMAL(10, 2) NOT NULL,
  "expectedCash" DECIMAL(10, 2),
  "countedCash" DECIMAL(10, 2),
  "variance" DECIMAL(10, 2),
  "closingNote" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "reconciledByAdminId" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconcileNote" TEXT,
  CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_shifts_opening_non_negative" CHECK ("openingFloat" >= 0),
  CONSTRAINT "cash_shifts_counted_non_negative" CHECK ("countedCash" IS NULL OR "countedCash" >= 0),
  CONSTRAINT "cash_shifts_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cash_shifts_reconciledByAdminId_fkey" FOREIGN KEY ("reconciledByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cash_shifts_single_open_per_staff" ON "cash_shifts"("staffId") WHERE "status" = 'OPEN';
CREATE INDEX "cash_shifts_staffId_status_idx" ON "cash_shifts"("staffId", "status");
CREATE INDEX "cash_shifts_status_openedAt_idx" ON "cash_shifts"("status", "openedAt");

ALTER TABLE "orders"
  ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'CUSTOMER_APP',
  ADD COLUMN "createdByStaffId" TEXT,
  ADD COLUMN "guestLabel" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_channel_createdAt_idx" ON "orders"("channel", "createdAt");

ALTER TABLE "payments"
  ADD COLUMN "cashShiftId" TEXT,
  ADD COLUMN "receivedByStaffId" TEXT,
  ADD COLUMN "cashTendered" DECIMAL(10, 2),
  ADD COLUMN "changeGiven" DECIMAL(10, 2);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_cash_amounts_valid" CHECK (("cashTendered" IS NULL OR "cashTendered" >= 0) AND ("changeGiven" IS NULL OR "changeGiven" >= 0)),
  ADD CONSTRAINT "payments_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payments_receivedByStaffId_fkey" FOREIGN KEY ("receivedByStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payments_cashShiftId_idx" ON "payments"("cashShiftId");

ALTER TABLE "refunds"
  ADD COLUMN "cashShiftId" TEXT,
  ADD COLUMN "reason" TEXT;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "refunds_cashShiftId_idx" ON "refunds"("cashShiftId");
