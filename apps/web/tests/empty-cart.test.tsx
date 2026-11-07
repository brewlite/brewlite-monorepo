import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EmptyCart } from '../components/cart/empty-cart';
import { getProducts } from '../services/product.service';
import { makeProduct } from './product-fixture';
vi.mock('../services/product.service', () => ({ getProducts: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows an empty cup and API product cards linking to real product details', async () => {
  vi.mocked(getProducts).mockResolvedValue([makeProduct({ name: 'Latte Hạnh Nhân', imageUrl: '/images/products/latte-hanh-nhan.jpg' })]);
  render(<EmptyCart />);
  expect(screen.getByText('Giỏ hàng đang chờ món đầu tiên')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Xem thực đơn' }).getAttribute('href')).toBe('/menu');
  const recommendations = within(screen.getByRole('region', { name: 'Gợi ý cho bạn' }));
  const name = await recommendations.findByRole('heading', { name: 'Latte Hạnh Nhân' });
  expect(within(name).getByRole('link').getAttribute('href')).toBe('/products/11111111-1111-4111-8111-111111111111');
  expect(recommendations.getByRole('img', { name: 'Latte Hạnh Nhân' }).getAttribute('src')).toBe('/images/products/latte-hanh-nhan.jpg');
});
it('supports retry and does not invent recommendations when the API is empty', async () => {
  vi.mocked(getProducts).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<EmptyCart />); fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText(/Hiện chưa có món gợi ý/)).toBeDefined();
  expect(screen.queryByRole('article')).toBeNull(); expect(getProducts).toHaveBeenCalledTimes(2);
});
