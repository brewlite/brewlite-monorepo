import { getStore, sendStore, type Order } from './store.service';
import axios from 'axios';
export async function startMockPayment(orderId: string, method: 'WALLET' | 'CARD') {
  const storage = `brewlite-mock-payment-${orderId}`;
  const previous = JSON.parse(sessionStorage.getItem(storage) || 'null') as { key: string; method: string } | null;
  if (previous && previous.method !== method) throw new Error('Lần thanh toán trước chưa rõ kết quả. Hãy gửi lại cùng phương thức trước khi đổi.');
  const command = previous ?? { key: crypto.randomUUID(), method };
  sessionStorage.setItem(storage, JSON.stringify(command));
  try {
    const payment = await sendStore<Payment>(`/orders/${orderId}/payments`, { method }, 'post', command.key);
    sessionStorage.removeItem(storage);
    return payment;
  } catch (error) {
    // A definitive rejection permits a fresh command. Network/5xx uncertainty
    // retains the key even after a page reload.
    if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500 && ![408, 429].includes(error.response.status) && !['IDEMPOTENCY_PENDING', 'IDEMPOTENCY_KEY_REUSED'].includes(error.response.data?.code)) sessionStorage.removeItem(storage);
    throw error;
  }
}
export type Payment = { refund?: Order['payments'][number]['refund']; id: string; orderId: string; method?: 'WALLET' | 'CARD'; status: 'PENDING' | 'UNKNOWN' | 'SUCCESS' | 'FAILED'; amount: string; providerPaymentId?: string | null; paymentUrl?: string; reconciliation?: { reason: string; responseCode?: string; httpStatus?: number; signatureVerified?: boolean; retryAfterSeconds?: number } };
export function paymentDestination(value: string) {
  const url = new URL(value);
  if (url.origin !== 'https://sandbox.vnpayment.vn' || url.pathname !== '/paymentv2/vpcpay.html' || url.username || url.password) throw new Error('Đường dẫn thanh toán Sandbox không hợp lệ.');
  return url.toString();
}
export async function startVNPay(orderId: string) {
  const storage = `brewlite-vnpay-${orderId}`;
  const key = sessionStorage.getItem(storage) || crypto.randomUUID(); sessionStorage.setItem(storage, key);
  const payment = await sendStore<Payment>(`/orders/${orderId}/payments`, { method: 'VNPAY' }, 'post', key);
  sessionStorage.removeItem(storage);
  if (!payment.paymentUrl) return { payment };
  return { payment, url: paymentDestination(payment.paymentUrl) };
}
export const readPayment = (id: string) => getStore<Payment>(`/payments/${encodeURIComponent(id)}`);
