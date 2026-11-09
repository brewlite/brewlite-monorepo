import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountPage from '../app/account/page';
import { getStore, sendStore } from '../services/store.service';
vi.mock('../components/layout/site-frame', () => ({ SiteFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../lib/auth-store', () => ({ useAuthUser: () => ({ fullName: 'Test Customer', email: 'test@example.test' }) }));
vi.mock('../services/auth.service', () => ({ authError: () => 'Không thể cập nhật' }));
vi.mock('../services/store.service', () => ({ getStore: vi.fn(), sendStore: vi.fn() }));
const notices = Array.from({ length: 7 }, (_, i) => ({ id: String(i), title: `Thông báo ${i}`, content: `BL-${i}`, isRead: false, orderId: `o-${i}` }));
beforeEach(() => {
  vi.mocked(getStore).mockImplementation(async (path) => path.includes('loyalty') ? { loyaltyPoints: 100, availablePoints: 80, reservedPoints: 20, transactions: [] } : notices);
  vi.mocked(sendStore).mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('uses server balances and expands notices locally without refetching', async () => {
  render(<AccountPage />);
  await screen.findByText('7 mới');
  expect(screen.getByText('80')).toBeTruthy(); expect(screen.getByText('20')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'Xem đơn hàng' })).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Xem thêm thông báo' }));
  expect(screen.getAllByRole('link', { name: 'Xem đơn hàng' })).toHaveLength(7);
  expect(getStore).toHaveBeenCalledTimes(2);
});
it('marks all notifications read with one request and updates locally', async () => {
  render(<AccountPage />); await screen.findByText('7 mới');
  fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
  await waitFor(() => expect(screen.queryByText('7 mới')).toBeNull());
  expect(sendStore).toHaveBeenCalledTimes(1);
  expect(sendStore).toHaveBeenCalledWith('/account/notifications/read-all', {}, 'patch');
  expect(getStore).toHaveBeenCalledTimes(2);
});
it('marks only the selected notice read', async () => {
  render(<AccountPage />); await screen.findByText('7 mới');
  fireEvent.click(screen.getAllByRole('button', { name: 'Đánh dấu đã đọc' })[0]);
  await screen.findByText('6 mới');
  expect(sendStore).toHaveBeenCalledWith('/account/notifications/0/read', {}, 'patch');
});
