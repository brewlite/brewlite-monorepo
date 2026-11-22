import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import AdminPage from '../app/admin/page';
import { getStore, sendStore } from '../services/store.service';
vi.mock('../components/layout/site-frame', () => ({ SiteFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/orders/orders-view', () => ({ statusName: {} }));
vi.mock('../services/store.service', () => ({ getStore: vi.fn(), sendStore: vi.fn() }));
vi.mock('../services/auth.service', () => ({
  authError: (error: Error) => error.message,
  onSessionExpired: vi.fn(),
  currentUser: vi.fn(async () => ({ id: 'admin-1', role: 'ADMIN' })),
}));
Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('labels product names correctly, searches without accents and opens the selected edit form with inline errors', async () => {
  vi.mocked(getStore).mockImplementation(async (path) => {
    if (path === '/admin/dashboard') return { paidOrders: 0, simulatedRevenue: '0', products: 2, label: '' };
    if (path === '/admin/products') return [{ id: 'p1', name: 'Trà Dâu', basePrice: '35000', categoryId: 'c', isAvailable: true }, { id: 'p2', name: 'Cà phê', basePrice: '30000', categoryId: 'c', isAvailable: true }];
    if (path === '/admin/categories') return [{ id: 'c', name: 'Đồ uống' }];
    return [];
  });
  vi.mocked(sendStore).mockRejectedValue(new Error('Không thể lưu sản phẩm'));
  render(<AdminPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Sản phẩm/ }));
  expect(await screen.findByRole('columnheader', { name: 'Tên sản phẩm' })).toBeDefined();
  expect(screen.queryByRole('columnheader', { name: 'Tên / Email' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm sản phẩm' }), { target: { value: 'tra dau' } });
  expect(screen.queryByRole('cell', { name: 'Cà phê' })).toBeNull();
  const row = screen.getByRole('cell', { name: 'Trà Dâu' }).closest('tr')!;
  expect(within(row).getByText('35.000đ')).toBeDefined();
  fireEvent.click(within(row).getByRole('button', { name: 'Sửa Trà Dâu' }));
  const modal = await screen.findByRole('dialog', { name: 'Sửa sản phẩm' });
  expect((within(modal).getByLabelText('Tên sản phẩm') as HTMLInputElement).value).toBe('Trà Dâu');
  fireEvent.click(within(modal).getByRole('button', { name: 'Lưu' }));
  expect(await within(modal).findByRole('alert')).toHaveProperty('textContent', 'Không thể lưu sản phẩm');
  expect(sendStore).toHaveBeenCalledWith('/admin/products/p1', expect.objectContaining({ name: 'Trà Dâu' }), 'patch');
  fireEvent.click(within(modal).getByRole('button', { name: 'Hủy' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
