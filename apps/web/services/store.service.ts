import { authHttp } from "./auth.service";
import { apiUrl } from "./product.service";
export type Order = {
  id: string;
  orderCode: string;
  channel?: "CUSTOMER_APP" | "COUNTER_POS";
  guestLabel?: string | null;
  createdByStaff?: { id: string; fullName: string; email: string } | null;
  status: string;
  version: number;
  finalTotal: string;
  subtotal?: string;
  discountAmount?: string;
  pointsDiscount?: string;
  pointsUsed?: number;
  couponCodeSnapshot?: string | null;
  note?: string | null;
  createdAt: string;
  expiresAt: string | null;
  user?: { id: string; fullName: string; email: string } | null;
  items: {
    id: string;
    productName: string;
    sizeName: string | null;
    unitPrice?: string | null;
    quantity: number;
    note: string | null;
    lineTotal: string;
    toppings: { toppingName: string; price: string }[];
  }[];
  payments: { id: string; status: string; method: string; amount: string; createdAt?: string; paidAt?: string | null; resolvedAt?: string | null; attemptNumber?: number | null; providerPaymentId?: string | null; cashTendered?: string | null; changeGiven?: string | null; refund?: { id: string; provider: string; status: "REQUESTED" | "PENDING" | "SUCCESS" | "FAILED" | "UNKNOWN"; amount: string; reason?: string | null; resolvedAt: string | null } | null }[];
  history: { fromStatus?: string | null; toStatus: string; actorId?: string | null; actor?: { id: string; fullName: string; email: string; role: string } | null; orderVersion?: number; createdAt: string }[];
};
export async function getStore<T>(path: string) {
  return (await authHttp.get<T>(apiUrl(path))).data;
}
export async function sendStore<T>(
  path: string,
  body: unknown,
  method: "post" | "patch" | "delete" = "post",
  key = crypto.randomUUID(),
) {
  return (
    await authHttp.request<T>({
      url: apiUrl(path),
      method,
      data: body,
      headers: { "Idempotency-Key": key },
    })
  ).data;
}
