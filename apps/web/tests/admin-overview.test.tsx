import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminOverview } from '../components/admin/admin-overview';
const data = { paidOrders: 6, simulatedRevenue: '270000', products: 2, label: 'Test data' };
afterEach(cleanup);
it('renders real accumulated metrics and stock alerts, and opens existing management sections', () => {
  const navigate = vi.fn();
  render(<AdminOverview data={data} products={[{ id: 'p', name: 'Coffee', isAvailable: true }, { id: 'hidden', name: 'Hidden', isAvailable: false }]} sizes={[{ id: 's', productId: 'p', name: 'M', onHand: null, reserved: 0, isAvailable: true }, { id: 's2', productId: 'p', name: 'L', onHand: 5, reserved: 2, isAvailable: true }]} orders={[]} now={0} onNavigate={navigate} />);
  expect(screen.getByText('270.000đ')).toBeDefined();
  expect(screen.getByText('1 Size của món đang bán chưa nhập tồn kho.')).toBeDefined();
  expect(screen.getByText('1 Size có tồn khả dụng từ 0 đến 3 ly.')).toBeDefined();
  expect(screen.queryByText(/Tăng 18%/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Size và tồn kho/ })); expect(navigate).toHaveBeenLastCalledWith('sizes');
  fireEvent.click(screen.getByRole('button', { name: /Giám sát đơn/ })); expect(navigate).toHaveBeenLastCalledWith('orders');
});
it('shows an honest empty attention state when there are no issues', () => {
  render(<AdminOverview data={{ ...data, paidOrders: 0, simulatedRevenue: '0' }} products={[]} sizes={[]} orders={[]} now={0} onNavigate={vi.fn()} />);
  expect(screen.getByText('Chưa có cảnh báo cần xử lý trong dữ liệu hiện tại.')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Nhập kho' })).toBeNull();
  expect(screen.getByText('Thống kê chi tiết').closest('summary')).not.toBeNull();
});
