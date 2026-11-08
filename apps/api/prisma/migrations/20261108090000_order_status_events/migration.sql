CREATE TABLE "order_status_events" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" "OrderStatus" NOT NULL,
  "toStatus" "OrderStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_status_events_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "order_status_events_orderId_createdAt_idx" ON "order_status_events"("orderId", "createdAt");
CREATE INDEX "orders_userId_createdAt_id_idx" ON "orders"("userId", "createdAt", "id");
CREATE INDEX "orders_status_createdAt_id_idx" ON "orders"("status", "createdAt", "id");
