import { getStore, sendStore, type Order } from "./store.service";
import { paymentDestination, type Payment } from "./payment.service";

export type CashShiftPayment = {
  id: string;
  orderId: string;
  orderCode: string;
  guestLabel: string | null;
  orderStatus: string;
  amount: string;
  cashTendered: string | null;
  changeGiven: string | null;
  createdAt: string;
};

export type CashShiftRefund = {
  id: string;
  paymentId: string;
  orderId: string;
  orderCode: string;
  guestLabel: string | null;
  amount: string;
  reason: string | null;
  createdAt: string;
};

export type CashShift = {
  id: string;
  status: "OPEN" | "CLOSED" | "RECONCILED";
  staff: { id: string; fullName: string; email: string };
  reconciledByAdmin: { id: string; fullName: string; email: string } | null;
  openingFloat: string;
  cashCollected: string;
  cashRefunded: string;
  netCash: string;
  expectedCash: string | null;
  countedCash: string | null;
  variance: string | null;
  closingNote: string | null;
  reconcileNote: string | null;
  openedAt: string;
  closedAt: string | null;
  reconciledAt: string | null;
  cashPaymentCount: number;
  cashRefundCount: number;
  qrPaidCount?: number;
  qrCollected?: string;
  payments: CashShiftPayment[];
  refunds: CashShiftRefund[];
};

export type StaffShiftResponse = {
  current: CashShift | null;
  history: CashShift[];
};

export type AdminCashShiftsSummary = {
  cashRevenue: string;
  cashOrders: number;
  posNonCashRevenue: string;
  posNonCashOrders: number;
  appOnlineRevenue: string;
  appOnlineOrders: number;
  pendingCashToCollect: string;
  reconciledCashTotal: string;
  totalVariance: string;
  openShiftsCount: number;
  closedPendingCount: number;
  reconciledCount: number;
};

export type AdminCashShiftsResponse = {
  summary: AdminCashShiftsSummary;
  shifts: CashShift[];
};

export type PosOrderItemInput = {
  productId: string;
  sizeId: string;
  toppingIds: string[];
  quantity: number;
  note?: string;
};

export function getCurrentShift() {
  return getStore<StaffShiftResponse>("/staff/pos/shifts/current");
}

export function openCashShift(openingFloat: number, key = crypto.randomUUID()) {
  return sendStore<CashShift>("/staff/pos/shifts/open", { openingFloat }, "post", key);
}

export function closeCashShift(countedCash: number, closingNote: string, key = crypto.randomUUID()) {
  return sendStore<CashShift>(
    "/staff/pos/shifts/current/close",
    { countedCash, closingNote },
    "post",
    key,
  );
}

export function listCounterOrders() {
  return getStore<Order[]>("/staff/pos/orders");
}

export function createCounterOrder(
  body: { items: PosOrderItemInput[]; guestLabel?: string; couponCode?: string; note?: string },
  key = crypto.randomUUID(),
) {
  return sendStore<Order>("/staff/pos/orders", body, "post", key);
}

export async function payCounterOrder(
  orderId: string,
  body: { method: "CASH" | "VNPAY" | "WALLET" | "CARD"; cashTendered?: number },
  key = crypto.randomUUID(),
) {
  const result = await sendStore<Payment & { order?: Order }>(
    `/staff/pos/orders/${encodeURIComponent(orderId)}/payments`,
    body,
    "post",
    key,
  );
  if (result.paymentUrl) {
    return { ...result, paymentUrl: paymentDestination(result.paymentUrl) };
  }
  return result;
}

export function cancelCounterOrder(
  orderId: string,
  body: { expectedVersion?: number; reason?: string },
  key = crypto.randomUUID(),
) {
  return sendStore<Order>(
    `/staff/pos/orders/${encodeURIComponent(orderId)}/cancel`,
    body,
    "post",
    key,
  );
}

export function reconcileCounterPayment(paymentId: string) {
  return sendStore<Payment>(
    `/staff/pos/payments/${encodeURIComponent(paymentId)}/reconcile`,
    {},
    "post",
  );
}

export function getAdminCashShifts() {
  return getStore<AdminCashShiftsResponse>("/admin/cash-shifts");
}

export function reconcileAdminShift(shiftId: string, note: string, key = crypto.randomUUID()) {
  return sendStore<CashShift>(
    `/admin/cash-shifts/${encodeURIComponent(shiftId)}/reconcile`,
    { note },
    "post",
    key,
  );
}
