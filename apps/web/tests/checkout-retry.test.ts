import { beforeEach, expect, it, vi } from 'vitest';
import { createCheckoutOrder } from '../services/checkout.service';
import { startVNPay, startMockPayment, paymentDestination } from '../services/payment.service';
import { sendStore } from '../services/store.service';
vi.mock('../services/store.service', () => ({ sendStore: vi.fn(), getStore: vi.fn() }));
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
const body = { cartVersion: 2, couponCode: '', pointsUsed: 0, quoteFingerprint: 'server-fingerprint' };
it('retains an uncertain mock attempt across reload, blocks method switching and gives a confirmed retry a new key', async () => {
  vi.mocked(sendStore).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ id: 'failed', status: 'FAILED' }).mockResolvedValueOnce({ id: 'new', status: 'SUCCESS' });
  await expect(startMockPayment('order', 'CARD')).rejects.toThrow('network');
  const stored = sessionStorage.getItem('brewlite-mock-payment-order');
  expect(stored).toBeTruthy();
  await expect(startMockPayment('order', 'WALLET')).rejects.toThrow();
  await startMockPayment('order', 'CARD');
  expect(vi.mocked(sendStore).mock.calls[0]).toEqual(vi.mocked(sendStore).mock.calls[1]);
  expect(sessionStorage.getItem('brewlite-mock-payment-order')).toBeNull();
  await startMockPayment('order', 'CARD');
  expect(vi.mocked(sendStore).mock.calls[2][3]).not.toBe(vi.mocked(sendStore).mock.calls[0][3]);
});
it('reuses the same Order key/body after a lost response and blocks replacing an uncertain command', async () => {
  vi.mocked(sendStore).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'o' });
  await expect(createCheckoutOrder('u', body)).rejects.toThrow('timeout');
  await expect(createCheckoutOrder('u', { ...body, pointsUsed: 1 })).rejects.toThrow('chưa rõ kết quả');
  await createCheckoutOrder('u', body);
  expect(vi.mocked(sendStore).mock.calls[0]).toEqual(vi.mocked(sendStore).mock.calls[1]);
  expect(sessionStorage.getItem('brewlite-checkout-u')).toBeNull();
});
it('reuses payment attempt key after network loss and accepts only the Sandbox gateway', async () => {
  vi.mocked(sendStore).mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ id: 'p', paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=abc' });
  await expect(startVNPay('o')).rejects.toThrow('timeout'); await startVNPay('o');
  expect(vi.mocked(sendStore).mock.calls[0]).toEqual(vi.mocked(sendStore).mock.calls[1]);
  expect(() => paymentDestination('https://attacker.example/')).toThrow();
  expect(() => paymentDestination('https://pay.vnpay.vn/vpcpay.html')).toThrow();
});
