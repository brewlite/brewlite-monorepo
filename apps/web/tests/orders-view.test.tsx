import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrdersView } from "../components/orders/orders-view";
import { getStore, sendStore } from "../services/store.service";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/auth-store", () => ({ useAuthUser: () => ({ fullName: "Staff", role: "STAFF", loyaltyPoints: 0 }), refreshAuth: vi.fn() }));
vi.mock("../services/store.service", () => ({ getStore: vi.fn(), sendStore: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each([['PAID', 5], ['COMPLETED', 1], ['CANCELLED', 1]])('limits periodic requests for %s orders', async (status, requests) => {
  vi.useFakeTimers();
  try {
    vi.mocked(getStore).mockResolvedValue({ id: 'o', orderCode: 'BL-POLL', status, version: 1, finalTotal: '35000', createdAt: '2026-11-09T00:00:00Z', items: [], payments: [], history: [] });
    render(<OrdersView id="o" />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(getStore).toHaveBeenCalledTimes(Number(requests));
  } finally { cleanup(); vi.useRealTimers(); }
});
it("loads STAFF queue and submits only the next legal transition with version and request key", async () => {
  vi.mocked(getStore).mockResolvedValue([{ id: "order-id", orderCode: "BL-HTTP", status: "PAID", version: 1, finalTotal: "35000", createdAt: "2026-11-07T00:00:00Z", items: [], payments: [], history: [] }]);
  vi.mocked(sendStore).mockResolvedValue({});
  render(<OrdersView staff />);
  fireEvent.click(await screen.findByRole("button", { name: "Duyệt và pha chế" }));
  await waitFor(() => expect(sendStore).toHaveBeenCalledWith("/staff/orders/order-id/status", { expectedVersion: 1, nextStatus: "PREPARING" }, "patch", expect.any(String)));
  expect(screen.queryByRole("button", { name: "Hoàn tất" })).toBeNull();
});
it.each([['PREPARING', 'Đã pha xong', 'READY'], ['READY', 'Xác nhận đã giao', 'COMPLETED']])('moves %s cards through the correct board action', async (status, label, nextStatus) => {
  vi.mocked(getStore).mockResolvedValue([{ id: 'board-order', orderCode: 'BL-BOARD', status, version: 3, finalTotal: '45000', createdAt: '2026-11-09T00:00:00Z', items: [], payments: [], history: [] }]);
  vi.mocked(sendStore).mockResolvedValue({});
  render(<OrdersView staff />);
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(sendStore).toHaveBeenCalledWith('/staff/orders/board-order/status', { expectedVersion: 3, nextStatus }, 'patch', expect.any(String)));
  expect(screen.queryByRole('button', { name: 'Duyệt và pha chế' })).toBeNull();
});
it("shows an empty state from an empty API response", async () => {
  vi.mocked(getStore).mockResolvedValue([]); render(<OrdersView />);
  expect(await screen.findByText("Chưa có đơn hàng phù hợp.")).toBeTruthy();
});
it('hides payment actions for expired orders and shows individual attempt history', async () => {
  sessionStorage.clear();
  vi.mocked(getStore).mockResolvedValue({ id: 'expired', orderCode: 'BL-EXPIRED', status: 'PENDING', version: 1, finalTotal: '45000', createdAt: '2026-11-09T00:00:00Z', expiresAt: '2026-11-09T00:10:00Z', items: [], payments: [{ id: 'p', status: 'FAILED', method: 'CARD', amount: '45000', createdAt: '2026-11-09T00:01:00Z', attemptNumber: 1 }], history: [] });
  render(<OrdersView id="expired" />);
  expect(await screen.findByText('Hết hạn')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Thanh toán bằng/ })).toBeNull();
  expect(screen.getByText('Các lần thanh toán')).toBeTruthy();
  expect(screen.getByText('Lần 1 · Thẻ mô phỏng')).toBeTruthy();
});
it('filters real API orders by status and keeps detail links', async () => {
  const base = { version: 1, finalTotal: '35000', createdAt: '2026-11-09T00:00:00Z', items: [], payments: [], history: [] };
  vi.mocked(getStore).mockResolvedValue([{ ...base, id: 'a', orderCode: 'BL-PENDING', status: 'PENDING' }, { ...base, id: 'b', orderCode: 'BL-PAID', status: 'PAID' }]);
  render(<OrdersView />);
  await screen.findByText('BL-PENDING');
  fireEvent.click(screen.getByRole('button', { name: 'Đã thanh toán · 1' }));
  expect(screen.queryByText('BL-PENDING')).toBeNull();
  expect(screen.getByText('BL-PAID').closest('a')?.getAttribute('href')).toBe('/orders/b');
});
it.each([['Ví mô phỏng', 'WALLET'], ['Thẻ mô phỏng', 'CARD']])('pays with %s using the backend and hides optional VNPay by default', async (label, method) => {
  vi.mocked(getStore).mockResolvedValue({ id: 'demo', orderCode: 'BL-DEMO', status: 'PENDING', version: 1, finalTotal: '35000', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), items: [], payments: [], history: [] });
  vi.mocked(sendStore).mockResolvedValue({ id: 'payment-result', status: 'SUCCESS' });
  render(<OrdersView id="demo" />);
  const button = await screen.findByRole('button', { name: `Thanh toán bằng ${label}` });
  expect(screen.queryByRole('button', { name: 'Thanh toán VNPay Sandbox' })).toBeNull();
  fireEvent.click(button);
  await waitFor(() => expect(sendStore).toHaveBeenCalledWith('/orders/demo/payments', { method }, 'post', expect.any(String)));
  expect(push).toHaveBeenCalledWith('/payments/result?paymentId=payment-result');
  // A response alone cannot make the UI claim PAID; it reloads the Order from API.
  expect(screen.queryByText('Đã thanh toán')).toBeNull();
});
it.each([['WALLET', 'Ví mô phỏng'], ['CARD', 'Thẻ mô phỏng']])('shows confirmed %s payment without offering another payment', async (method, label) => {
  vi.mocked(getStore).mockResolvedValue({ id: 'paid', orderCode: 'BL-PAID', status: 'PAID', version: 2, finalTotal: '45000', subtotal: '45000', createdAt: '2026-11-09T00:00:00Z', items: [], payments: [{ id: 'p', method, status: 'SUCCESS', amount: '45000' }], history: [{ toStatus: 'PENDING', createdAt: '2026-11-09T00:00:00Z' }, { toStatus: 'PAID', createdAt: '2026-11-09T00:01:00Z' }] });
  render(<OrdersView id="paid" />);
  expect(await screen.findByText(`Đã thanh toán thành công qua ${label}.`)).toBeTruthy();
  expect(screen.getByText(`Qua ${label}`)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Kiểm tra lại kết quả' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Thanh toán bằng/ })).toBeNull();
});
it('shows an unpaid cancelled order and a menu link', async () => {
  vi.mocked(getStore).mockResolvedValue({ id: 'cancelled', orderCode: 'BL-CANCELLED', status: 'CANCELLED', version: 2, finalTotal: '45000', createdAt: '2026-11-09T00:00:00Z', items: [], payments: [], history: [{ toStatus: 'CANCELLED', createdAt: '2026-11-09T00:01:00Z' }] });
  render(<OrdersView id="cancelled" />);
  expect(await screen.findByText(/Không có khoản thanh toán nào được thực hiện/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Về thực đơn' }).getAttribute('href')).toBe('/menu');
  expect(screen.queryByRole('button', { name: /Thanh toán bằng/ })).toBeNull();
});

it('requires confirmation before cancelling paid mock and submits expectedVersion', async () => {
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this: HTMLDialogElement){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this: HTMLDialogElement){this.removeAttribute('open');}});
  vi.mocked(getStore).mockResolvedValue({id:'refund-order',orderCode:'BL-REFUND',status:'PAID',version:4,finalTotal:'40000',createdAt:'2026-11-09T00:00:00Z',items:[],payments:[{id:'p',method:'WALLET',status:'SUCCESS',amount:'40000',providerPaymentId:'11111111-1111-4111-8111-111111111111'}],history:[]});
  vi.mocked(sendStore).mockResolvedValue({status:'CANCELLED'});
  render(<OrdersView id="refund-order"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Hủy đơn và hoàn tiền mô phỏng'}));
  expect(sendStore).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog',{name:'Hủy đơn đã thanh toán'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Giữ đơn'}));
  expect(sendStore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Hủy đơn và hoàn tiền mô phỏng'}));
  fireEvent.click(screen.getByRole('button',{name:'Hủy và hoàn tiền mô phỏng'}));
  await waitFor(()=>expect(sendStore).toHaveBeenCalledWith('/orders/refund-order/cancel',{expectedVersion:4},'post',expect.any(String)));
});
it('shows a confirmed mock refund without rewriting original payment success', async()=>{
  vi.mocked(getStore).mockResolvedValue({id:'refunded',orderCode:'BL-REFUNDED',status:'CANCELLED',version:5,finalTotal:'40000',createdAt:'2026-11-09T00:00:00Z',items:[],payments:[{id:'p',method:'WALLET',status:'SUCCESS',amount:'40000',refund:{id:'r',provider:'MOCK',status:'SUCCESS',amount:'40000',resolvedAt:'2026-11-09T01:00:00Z'}}],history:[]});
  render(<OrdersView id="refunded"/>);
  expect(await screen.findByText(/Đã hoàn tiền mô phỏng: 40/)).toBeTruthy();
  expect(screen.getAllByText('Thành công').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button',{name:'Hủy đơn và hoàn tiền mô phỏng'})).toBeNull();
});
it('does not offer automatic VNPay refund', async()=>{
  vi.mocked(getStore).mockResolvedValue({id:'external',orderCode:'BL-EXTERNAL',status:'PAID',version:4,finalTotal:'40000',createdAt:'2026-11-09T00:00:00Z',items:[],payments:[{id:'p',method:'CARD',status:'SUCCESS',amount:'40000',providerPaymentId:'vnpay:external'}],history:[]});
  render(<OrdersView id="external"/>);
  expect(await screen.findByText(/Chưa hỗ trợ hủy và hoàn tiền VNPay trực tuyến/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Hủy đơn và hoàn tiền mô phỏng'})).toBeNull();
});

it('loads read-only today history tab inside staff board and filters completed vs cancelled', async () => {
  vi.mocked(getStore).mockImplementation(async (path: string) => {
    if (path === '/staff/orders/today') {
      return [
        {
          id: 'done-1',
          orderCode: 'BL-DONE-1',
          channel: 'COUNTER_POS',
          guestLabel: 'Anh Nam',
          status: 'COMPLETED',
          version: 3,
          finalTotal: '55000',
          createdAt: '2026-11-22T02:00:00Z',
          expiresAt: null,
          items: [{ id: 'i1', productName: 'Bạc xỉu', sizeName: 'M', quantity: 1, note: null, lineTotal: '55000', toppings: [] }],
          payments: [{ id: 'p1', status: 'SUCCESS', method: 'CASH', amount: '55000' }],
          history: [],
        },
        {
          id: 'cancel-1',
          orderCode: 'BL-CANCEL-1',
          channel: 'COUNTER_POS',
          guestLabel: 'Chị Hoa',
          status: 'CANCELLED',
          version: 2,
          finalTotal: '45000',
          createdAt: '2026-11-22T03:00:00Z',
          expiresAt: null,
          items: [{ id: 'i2', productName: 'Trà đào', sizeName: 'L', quantity: 1, note: null, lineTotal: '45000', toppings: [] }],
          payments: [{ id: 'p2', status: 'SUCCESS', method: 'WALLET', amount: '45000', refund: { id: 'r1', provider: 'COUNTER_MANUAL', status: 'SUCCESS', amount: '45000', resolvedAt: '2026-11-22T03:05:00Z' } }],
          history: [],
        },
      ];
    }
    return [];
  });

  render(<OrdersView staff />);
  fireEvent.click(screen.getByRole('tab', { name: 'Hôm nay' }));

  expect(await screen.findByText(/BL-DONE-1/)).toBeTruthy();
  expect(screen.getByText(/BL-CANCEL-1/)).toBeTruthy();
  expect(screen.getByText('Đã hoàn tiền')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Duyệt và pha chế' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Hoàn tiền' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất (1)' }));
  expect(screen.getByText(/BL-DONE-1/)).toBeTruthy();
  expect(screen.queryByText(/BL-CANCEL-1/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Đã hủy (1)' }));
  expect(screen.queryByText(/BL-DONE-1/)).toBeNull();
  expect(screen.getByText(/BL-CANCEL-1/)).toBeTruthy();
});
