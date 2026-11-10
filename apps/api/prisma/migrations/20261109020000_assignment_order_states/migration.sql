-- Rename preserves existing orders/history; no reset, seed or deletion.
ALTER TYPE "OrderStatus" RENAME VALUE 'PENDING_PAYMENT' TO 'PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';
ALTER TABLE "orders" ADD COLUMN "checkoutCartSnapshot" JSONB;
