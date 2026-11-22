import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EmptyCart } from '../components/cart/empty-cart';
import { getRecommendedProducts } from '../services/product.service';
import { makeProduct } from './product-fixture';
vi.mock('../services/product.service', () => ({ getRecommendedProducts: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows an empty cup and best-selling API product cards in server rank order', async () => {
  vi.mocked(getRecommendedProducts).mockResolvedValue([
    makeProduct({ id: '11111111-1111-4111-8111-111111111111', name: 'Latte Hạnh Nhân', imageUrl: '/images/products/latte-hanh-nhan.jpg' }),
    makeProduct({ id: '22222222-2222-4222-8222-222222222222', name: 'Bạc Xỉu', imageUrl: '/images/products/bac-xiu.jpg' }),
  ]);
  render(<EmptyCart />);
  expect(screen.getByText('Giỏ hàng đang chờ món đầu tiên')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Xem thực đơn' }).getAttribute('href')).toBe('/menu');
  const recommendations = within(screen.getByRole('region', { name: 'Gợi ý cho bạn' }));
  const headings = await recommendations.findAllByRole('heading', { level: 3 });
  expect(headings.map((h) => h.textContent)).toEqual(['Latte Hạnh Nhân', 'Bạc Xỉu']);
  expect(within(headings[0]).getByRole('link').getAttribute('href')).toBe('/products/11111111-1111-4111-8111-111111111111');
  expect(recommendations.getByRole('img', { name: 'Latte Hạnh Nhân' }).getAttribute('src')).toBe('/images/products/latte-hanh-nhan.jpg');
});
it('supports retry and does not invent recommendations when the API is empty', async () => {
  vi.mocked(getRecommendedProducts).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<EmptyCart />); fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText(/Hiện chưa có món gợi ý/)).toBeDefined();
  expect(screen.queryByRole('article')).toBeNull(); expect(getRecommendedProducts).toHaveBeenCalledTimes(2);
});
