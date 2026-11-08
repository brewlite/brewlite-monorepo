import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PaymentResult } from '../components/checkout/payment-result';
import { readPayment } from '../services/payment.service';
vi.mock('../services/payment.service', () => ({ readPayment: vi.fn() }));
vi.mock('../services/auth.service', () => ({ authError: () => 'Cần đăng nhập để xem kết quả' }));
vi.mock('../services/store.service', () => ({ sendStore: vi.fn() }));
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
