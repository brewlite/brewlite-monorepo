import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountManagement } from '../components/admin/account-management';
import { getStore } from '../services/store.service';
vi.mock('../services/store.service', () => ({ getStore: vi.fn(), sendStore: vi.fn() }));
vi.mock('../lib/auth-store', () => ({ useAuthUser: () => ({ id: 'admin', role: 'ADMIN' }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('loads older accounts from the next page and searches across all accounts', async () => {
  vi.mocked(getStore).mockImplementation(async (path) => {
    const params = new URL(path, 'http://localhost').searchParams;
    const older = params.get('page') === '2' || params.get('query') === 'older@example.test';
    return { items: [{ id: older ? 'old' : 'new', email: older ? 'older@example.test' : 'new@example.test', role: 'CUSTOMER', isActive: true }],
      total: params.get('query') ? 1 : 126, totalPages: params.get('query') ? 1 : 6 };
  });
  render(<AccountManagement onEdit={vi.fn()} />);
  await screen.findByText('new@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
  await screen.findByText('older@example.test');
  expect(screen.getByText('Trang 2 / 6')).toBeDefined();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'older@example.test' } });
  await screen.findByText('older@example.test');
  expect(screen.getByText('Trang 1 / 1')).toBeDefined();
  const lastUrl = new URL(vi.mocked(getStore).mock.calls.at(-1)![0], 'http://localhost');
  expect(lastUrl.searchParams.get('page')).toBe('1');
  expect(lastUrl.searchParams.get('query')).toBe('older@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Nhân viên' }));
  await waitFor(() => expect(vi.mocked(getStore).mock.calls.at(-1)![0]).toContain('role=STAFF'));
});

it('ignores stale searches and retries failed requests', async () => {
  let resolveOld!: (value: unknown) => void;
  vi.mocked(getStore).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  vi.mocked(getStore).mockRejectedValueOnce(new Error('offline'));
  vi.mocked(getStore).mockResolvedValue({ items: [{ id: 'found', email: 'found@example.test', role: 'CUSTOMER' }], total: 1, totalPages: 1 });
  render(<AccountManagement onEdit={vi.fn()} />);
  await waitFor(() => expect(getStore).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'found' } });
  await screen.findByRole('alert');
  resolveOld({ items: [{ id: 'stale', email: 'stale@example.test' }], total: 1, totalPages: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  await screen.findByText('found@example.test');
  expect(screen.queryByText('stale@example.test')).toBeNull();
});
