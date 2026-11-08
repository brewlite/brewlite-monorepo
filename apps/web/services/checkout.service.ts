import axios from 'axios';
import { sendStore, type Order } from './store.service';
export type CheckoutBody = { cartVersion: number; couponCode: string; pointsUsed: number; quoteFingerprint: string };
type Pending = { key: string; body: CheckoutBody };
export const pendingCheckout = (userId: string): Pending | null => JSON.parse(sessionStorage.getItem(`brewlite-checkout-${userId}`) || 'null');
export async function createCheckoutOrder(userId: string, body: CheckoutBody) {
  const name = `brewlite-checkout-${userId}`;
  const previous = pendingCheckout(userId);
  if (previous && JSON.stringify(previous.body) !== JSON.stringify(body)) throw new Error('Yêu cầu tạo đơn trước chưa rõ kết quả. Hãy thử lại yêu cầu đó trước khi đổi cấu hình.');
  const command = previous || { key: crypto.randomUUID(), body };
  sessionStorage.setItem(name, JSON.stringify(command));
  try {
    const order = await sendStore<Order>('/orders', command.body, 'post', command.key);
    sessionStorage.removeItem(name); return order;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500 && ![408, 429].includes(error.response.status) && !['IDEMPOTENCY_PENDING', 'IDEMPOTENCY_KEY_REUSED'].includes(error.response.data?.code)) sessionStorage.removeItem(name);
    throw error;
  }
}
