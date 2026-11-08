import { getStore, sendStore } from './store.service';
export type Payment = { id: string; orderId: string; status: 'PENDING' | 'UNKNOWN' | 'SUCCESS' | 'FAILED'; amount: string; providerPaymentId?: string | null; paymentUrl?: string; reconciliation?: { reason: string; responseCode?: string; httpStatus?: number; signatureVerified?: boolean; retryAfterSeconds?: number } };
export function paymentDestination(value: string) {
  const url = new URL(value);
  if (url.origin !== 'https://sandbox.vnpayment.vn' || url.pathname !== '/paymentv2/vpcpay.html' || url.username || url.password) throw new Error('Đường dẫn thanh toán Sandbox không hợp lệ.');
  return url.toString();
}
export async function startVNPay(orderId: string) {
  const storage = `brewlite-vnpay-${orderId}`;
  const key = sessionStorage.getItem(storage) || crypto.randomUUID(); sessionStorage.setItem(storage, key);
  const payment = await sendStore<Payment>(`/orders/${orderId}/payments`, { method: 'VNPAY' }, 'post', key);
  if (!payment.paymentUrl) { sessionStorage.removeItem(storage); return { payment }; }
  return { payment, url: paymentDestination(payment.paymentUrl) };
}
export const readPayment = (id: string) => getStore<Payment>(`/payments/${encodeURIComponent(id)}`);
