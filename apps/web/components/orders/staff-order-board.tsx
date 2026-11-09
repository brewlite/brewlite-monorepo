"use client";
import Link from 'next/link';
import type { Order } from '../../services/store.service';
import { formatPrice } from '../../lib/format-price';
const columns = [
  { status: 'PAID', title: 'Chờ duyệt', hint: 'Duyệt để bắt đầu pha chế', next: 'PREPARING', action: 'Duyệt và pha chế', empty: 'Chưa có đơn chờ duyệt' },
  { status: 'PREPARING', title: 'Đang pha chế', hint: 'Pha xong thì báo khách', next: 'READY', action: 'Đã pha xong', empty: 'Chưa có đơn đang pha chế' },
  { status: 'READY', title: 'Chờ nhận món', hint: 'Khách nhận món thì xác nhận', next: 'COMPLETED', action: 'Xác nhận đã giao', empty: 'Chưa có đơn chờ nhận món' },
];
type Props = { orders: Order[]; user: { fullName: string; role: string } | null; loading: boolean; pending: boolean; error: string; retry: () => void; update: (order: Order, next: string) => void };
export function StaffOrderBoard({ orders, user, loading, pending, error, retry, update }: Props) {
  return <div className="staff-board"><header className="staff-board-heading"><h1>Đơn cần phục vụ</h1></header>
    {loading && <p role="status">Đang tải đơn từ máy chủ…</p>}
    {error && <p className="staff-board-error" role="alert">{error} <button onClick={retry}>Thử lại</button>{!user && <Link href="/login">Đăng nhập</Link>}</p>}
    <div className="staff-board-columns">{columns.map((column) => {
      const rows = orders.filter((o) => o.status === column.status).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return <section className="staff-board-column" key={column.status} aria-label={column.title}><header><div><h2>{column.title}</h2><p>{column.hint}</p></div><span className="staff-board-count" aria-label={`${rows.length} đơn`}>{rows.length}</span></header>
        {!loading && !error && rows.length === 0 && <p className="staff-board-empty">{column.empty}</p>}
        {rows.map((order) => {
          const payment = order.payments.find((p) => p.status === 'SUCCESS');
          const method = !payment ? 'Đã thanh toán' : payment.providerPaymentId?.startsWith('vnpay:') ? 'Đã thanh toán · VNPay Sandbox' : `Đã thanh toán · ${payment.method === 'WALLET' ? 'Ví mô phỏng' : 'Thẻ mô phỏng'}`;
          return <article className="staff-board-card" key={order.id} aria-label={`Đơn ${order.orderCode}`}>
            <div className="staff-board-items">{order.items.map((item) => <div className="staff-board-item" key={item.id}><div className="staff-board-item-title"><strong>{item.productName} <span>× {item.quantity}</span></strong><strong>{formatPrice(order.items.length === 1 ? order.finalTotal : item.lineTotal)}đ</strong></div><p>Size {item.sizeName} · {item.quantity} ly · {item.toppings.map((t) => t.toppingName).join(', ') || 'Không topping'}</p>{item.note && <p className="staff-board-note">Ghi chú: {item.note}</p>}</div>)}</div>
            {order.items.length > 1 && <div className="staff-board-total"><span>Tổng cộng</span><strong>{formatPrice(order.finalTotal)}đ</strong></div>}
            <div className="staff-board-meta"><span>{method}</span><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}</time></div>
            <p className="staff-board-code">{order.orderCode}</p>
            {user?.role === 'STAFF' && <button disabled={pending} onClick={() => update(order, column.next)}>{column.action}</button>}
          </article>;
        })}
      </section>;
    })}</div>
  </div>;
}
