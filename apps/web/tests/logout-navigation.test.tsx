vi.mock('../components/cart/cart-provider', () => ({ useCart: () => ({ count: 3 }) }));
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Header } from '../components/layout/header';
import { logout } from '../services/auth.service';
import { setAuthUser } from '../lib/auth-store';
const { account } = vi.hoisted(() => ({ account: { role: 'CUSTOMER', id: 'u', fullName: 'Test account', email: 'test@example.test' } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));
vi.mock('../components/auth/login-form', () => ({ default: () => null }));
vi.mock('../lib/auth-store', () => ({ useAuthUser: () => account, setAuthUser: vi.fn() }));
vi.mock('../services/auth.service', () => ({ logout: vi.fn(), authError: () => 'Đăng xuất chưa thành công' }));
const originalLocation = window.location;
afterEach(() => { cleanup(); vi.clearAllMocks(); Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }); });
it.each(['CUSTOMER', 'STAFF', 'ADMIN'])('reloads home after confirmed logout for %s', async (role) => {
  account.role = role;
  let confirm!: () => void;
  vi.mocked(logout).mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
  const replace = vi.fn(); Object.defineProperty(window, 'location', { configurable: true, value: { replace } });
  render(<Header />); fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
  expect(replace).not.toHaveBeenCalled(); expect(setAuthUser).not.toHaveBeenCalled();
  confirm();
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  expect(setAuthUser).toHaveBeenCalledWith(null);
});
it('stays on the current page and keeps auth state when logout fails', async () => {
  vi.mocked(logout).mockRejectedValueOnce(new Error('offline'));
  const replace = vi.fn(); Object.defineProperty(window, 'location', { configurable: true, value: { replace } });
  render(<Header />); fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
  await screen.findByRole('alert'); expect(replace).not.toHaveBeenCalled(); expect(setAuthUser).not.toHaveBeenCalled();
});

it('shows the live cart quantity badge', () => { render(<Header />); expect(screen.getByLabelText('3 sản phẩm trong giỏ').textContent).toBe('3'); });
