import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PaymentResult } from '../components/checkout/payment-result';
import { readPayment } from '../services/payment.service';
import { getStore, sendStore } from '../services/store.service';
vi.mock('../services/payment.service', () => ({ readPayment: vi.fn() }));
vi.mock('../services/auth.service', () => ({ authError: () => 'Cần đăng nhập để xem kết quả' }));
vi.mock('../services/store.service', () => ({ sendStore: vi.fn(), getStore: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('never shows success while the backend reports PENDING or UNKNOWN', async () => {
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'UNKNOWN', amount: '35000' });
  render(<PaymentResult paymentId="p" />);
  expect(await screen.findByText(/Kết quả thanh toán chưa xác định/)).toBeDefined();
  expect(screen.queryByText('Thanh toán thành công')).toBeNull();
});
it('shows success only from authenticated backend payment status', async () => {
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'SUCCESS', amount: '35000' });
  render(<PaymentResult paymentId="p" />);
  expect(await screen.findByText('Thanh toán thành công')).toBeDefined();
  expect(screen.getByText('Xem chi tiết đơn').getAttribute('href')).toBe('/orders/o');
});
it('rejects an invalid return and handles failed status without a success claim', async () => {
  const rendered = render(<PaymentResult paymentId={null} />);
  expect(screen.getByRole('alert')).toBeDefined(); expect(readPayment).not.toHaveBeenCalled();
  rendered.unmount(); vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'FAILED', amount: '35000' });
  render(<PaymentResult paymentId="p" />); expect(await screen.findByText('Thanh toán thất bại')).toBeDefined();
});
it('shows the unverified reconciliation reason without claiming payment success', async () => {
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'UNKNOWN', amount: '45000', providerPaymentId: 'vnpay:fixture' });
  vi.mocked(sendStore).mockResolvedValue({ id: 'p', orderId: 'o', status: 'UNKNOWN', amount: '45000', reconciliation: { reason: 'MISSING_SIGNATURE', responseCode: '91', signatureVerified: false } });
  render(<PaymentResult paymentId="p" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Yêu cầu đối soát VNPay' }));
  expect(await screen.findByText(/Mã phản hồi chưa xác minh: 91/)).toBeDefined();
  expect(screen.queryByText('Thanh toán thành công')).toBeNull();
});
it.each([['WALLET', 'Ví mô phỏng'], ['CARD', 'Thẻ mô phỏng']] as const)('shows the real order code and %s method from backend data', async (method, label) => {
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'SUCCESS', amount: '45000', method });
  vi.mocked(getStore).mockResolvedValue({ orderCode: 'BL-CONFIRMED' });
  render(<PaymentResult paymentId="p" />);
  expect(await screen.findByText('BL-CONFIRMED')).toBeTruthy();
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getByText('45.000đ')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Về thực đơn' }).getAttribute('href')).toBe('/menu');
});
it('links failed payments back to the order without automatically submitting a retry', async () => {
  vi.mocked(getStore).mockResolvedValue({ orderCode: 'BL-RETRY', status: 'PENDING', expiresAt: new Date(Date.now() + 600000).toISOString(), payments: [{ status: 'FAILED' }] });
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'FAILED', amount: '45000', method: 'CARD' });
  render(<PaymentResult paymentId="p" />);
  expect((await screen.findByRole('link', { name: 'Thử lại thanh toán' })).getAttribute('href')).toBe('/orders/o');
  expect(sendStore).not.toHaveBeenCalled();
});
it.each([
  ['PAID', 1, 'Đơn không còn chờ thanh toán'],
  ['CANCELLED', 1, 'Đơn không còn chờ thanh toán'],
  ['PENDING', 3, 'Đã hết 3 lần'],
])('does not offer retry for %s / %s attempts', async (status, count, message) => {
  vi.mocked(readPayment).mockResolvedValue({ id: 'p', orderId: 'o', status: 'FAILED', amount: '45000' });
  vi.mocked(getStore).mockResolvedValue({ orderCode: 'BL', status, expiresAt: new Date(Date.now() + 600000).toISOString(), payments: Array.from({ length: Number(count) }, () => ({ status: 'FAILED' })) });
  render(<PaymentResult paymentId="p" />);
  expect(await screen.findByText(new RegExp(message))).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Thử lại thanh toán' })).toBeNull();
});
it('does not show an old FAILED payment while loading a new attempt', async () => {
  vi.mocked(readPayment).mockResolvedValueOnce({ id: 'old', orderId: 'o', status: 'FAILED', amount: '45000' }).mockImplementationOnce(() => new Promise(() => {}));
  const view = render(<PaymentResult paymentId="old" />);
  await screen.findByText('Thanh toán thất bại');
  view.rerender(<PaymentResult paymentId="new" />);
  expect(screen.queryByText('Thanh toán thất bại')).toBeNull();
  expect(screen.getByText('Đang kiểm tra thanh toán…')).toBeTruthy();
});

it('shows verified mock refund separately from original SUCCESS payment',async()=>{
  vi.mocked(readPayment).mockResolvedValue({id:'p',orderId:'o',status:'SUCCESS',amount:'40000',refund:{id:'r',provider:'MOCK',status:'SUCCESS',amount:'40000',resolvedAt:'2026-11-09T00:00:00Z'}});
  render(<PaymentResult paymentId="p"/>);
  expect(await screen.findByText('Đã hoàn tiền mô phỏng')).toBeTruthy();
  expect(screen.queryByText('Cảm ơn bạn! Đơn hàng đã được ghi nhận.')).toBeNull();
  expect(screen.getByText('Đã thanh toán')).toBeTruthy();
});
