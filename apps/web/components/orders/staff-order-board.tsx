"use client";
import { useRef, useState } from 'react';
import Link from 'next/link';
import { getStore, type Order } from '../../services/store.service';
import { authError } from '../../services/auth.service';
import { formatPrice } from '../../lib/format-price';
import { CounterRefundDialog, StaffShiftControl } from '../staff/staff-cash-controls';

const columns = [
  { status: 'PAID', title: 'Chờ duyệt', next: 'PREPARING', action: 'Duyệt và pha chế', empty: 'Chưa có đơn chờ duyệt' },
  { status: 'PREPARING', title: 'Đang pha chế', next: 'READY', action: 'Đã pha xong', empty: 'Chưa có đơn đang pha chế' },
  { status: 'READY', title: 'Chờ nhận món', next: 'COMPLETED', action: 'Xác nhận đã giao', empty: 'Chưa có đơn chờ nhận món' },
];

type Props = {
  orders: Order[];
  user: { fullName: string; role: string } | null;
  loading: boolean;
  pending: boolean;
  error: string;
  retry: () => void;
  update: (order: Order, next: string) => void;
};

function paymentMethodLabel(order: Order) {
  const payment = order.payments.find((p) => p.status === 'SUCCESS');
  if (!payment) return order.status === 'CANCELLED' ? 'Chưa thanh toán' : 'Đã thanh toán';
  if (payment.method === 'CASH') return 'Tiền mặt';
  if (payment.providerPaymentId?.startsWith('vnpay:') || payment.method === 'WALLET') {
    return 'Chuyển khoản QR';
  }
  return 'Thẻ / Ví';
}

export function StaffOrderBoard({ orders, user, loading, pending, error, retry, update }: Props) {
  const [tab, setTab] = useState<'queue' | 'today'>('queue');
  const [todayFilter, setTodayFilter] = useState<'ALL' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState('');
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);
  const todayReqId = useRef(0);

  async function loadToday() {
    const reqId = ++todayReqId.current;
    setTodayLoading(true);
    setTodayError('');
    try {
      const rows = await getStore<Order[]>('/staff/orders/today');
      if (reqId === todayReqId.current) {
        setTodayOrders(Array.isArray(rows) ? rows : []);
      }
    } catch (caught) {
      if (reqId === todayReqId.current) {
        setTodayError(authError(caught));
      }
    } finally {
      if (reqId === todayReqId.current) {
        setTodayLoading(false);
      }
    }
  }

  function openTodayTab() {
    setTab('today');
    void loadToday();
  }

  const filteredToday = todayOrders.filter((order) =>
    todayFilter === 'ALL' ? true : order.status === todayFilter,
  );
  const completedTodayCount = todayOrders.filter((o) => o.status === 'COMPLETED').length;
  const cancelledTodayCount = todayOrders.filter((o) => o.status === 'CANCELLED').length;

  return (
    <div className="staff-board">
      <header className="staff-board-heading">
        <div className="staff-board-title-group">
          <h1>Đơn cần phục vụ</h1>
          <div className="staff-board-tabs" role="tablist" aria-label="Chế độ xem đơn">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'queue'}
              className={`staff-board-tab${tab === 'queue' ? ' active' : ''}`}
              onClick={() => setTab('queue')}
            >
              Đang phục vụ ({orders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'today'}
              className={`staff-board-tab${tab === 'today' ? ' active' : ''}`}
              onClick={openTodayTab}
            >
              Hôm nay
            </button>
          </div>
        </div>
        {user?.role === 'STAFF' && <StaffShiftControl />}
      </header>
      {tab === 'queue' ? (
        <>
          {loading && <p role="status">Đang tải đơn từ máy chủ…</p>}
          {error && (
            <p className="staff-board-error" role="alert">
              {error} <button onClick={retry}>Thử lại</button>
              {!user && <Link href="/login">Đăng nhập</Link>}
            </p>
          )}
          <div className="staff-board-columns">
            {columns.map((column) => {
              const rows = orders
                .filter((o) => o.status === column.status)
                .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
              return (
                <section className="staff-board-column" key={column.status} aria-label={column.title}>
                  <header>
                    <div>
                      <h2>{column.title}</h2>
                    </div>
                    <span className="staff-board-count" aria-label={`${rows.length} đơn`}>
                      {rows.length}
                    </span>
                  </header>
                  {!loading && !error && rows.length === 0 && (
                    <p className="staff-board-empty">{column.empty}</p>
                  )}
                  {rows.map((order) => {
                    const payment = order.payments.find((p) => p.status === 'SUCCESS');
                    const method = paymentMethodLabel(order);
                    const canRefundCounter =
                      user?.role === 'STAFF' &&
                      column.status === 'PAID' &&
                      order.channel === 'COUNTER_POS' &&
                      !!payment &&
                      !payment.refund &&
                      !payment.providerPaymentId?.startsWith('vnpay:');

                    return (
                      <article className="staff-board-card" key={order.id} aria-label={`Đơn ${order.orderCode}`}>
                        {order.channel === 'COUNTER_POS' && (
                          <p className="staff-board-guest">
                            Tại quầy · {order.guestLabel || 'Khách tại quầy'}
                          </p>
                        )}
                        <div className="staff-board-items">
                          {order.items.map((item) => (
                            <div className="staff-board-item" key={item.id}>
                              <div className="staff-board-item-title">
                                <strong>
                                  {item.productName} <span>× {item.quantity}</span>
                                </strong>
                                <strong>
                                  {formatPrice(order.items.length === 1 ? order.finalTotal : item.lineTotal)}đ
                                </strong>
                              </div>
                              <p>
                                Size {item.sizeName} · {item.quantity} ly ·{' '}
                                {item.toppings.map((t) => t.toppingName).join(', ') || 'Không topping'}
                              </p>
                              {item.note && <p className="staff-board-note">Ghi chú: {item.note}</p>}
                            </div>
                          ))}
                        </div>
                        {order.items.length > 1 && (
                          <div className="staff-board-total">
                            <span>Tổng cộng</span>
                            <strong>{formatPrice(order.finalTotal)}đ</strong>
                          </div>
                        )}
                        <div className="staff-board-meta">
                          <span>{method}</span>
                          <time dateTime={order.createdAt}>
                            {new Date(order.createdAt).toLocaleTimeString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                              hour12: false,
                            })}
                          </time>
                        </div>
                        <p className="staff-board-code">{order.orderCode}</p>
                        {user?.role === 'STAFF' && (
                          <button disabled={pending} onClick={() => update(order, column.next)}>
                            {column.action}
                          </button>
                        )}
                        {canRefundCounter && (
                          <button
                            type="button"
                            className="staff-board-refund"
                            disabled={pending}
                            onClick={() => setRefundTarget(order)}
                          >
                            Hoàn tiền
                          </button>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <section className="staff-history" aria-label="Đơn hôm nay">
          <div className="staff-history-bar">
            <div className="staff-history-filters" role="group" aria-label="Lọc đơn hôm nay">
              <button
                type="button"
                className={`staff-history-filter${todayFilter === 'ALL' ? ' active' : ''}`}
                onClick={() => setTodayFilter('ALL')}
              >
                Tất cả ({todayOrders.length})
              </button>
              <button
                type="button"
                className={`staff-history-filter${todayFilter === 'COMPLETED' ? ' active' : ''}`}
                onClick={() => setTodayFilter('COMPLETED')}
              >
                Hoàn tất ({completedTodayCount})
              </button>
              <button
                type="button"
                className={`staff-history-filter${todayFilter === 'CANCELLED' ? ' active' : ''}`}
                onClick={() => setTodayFilter('CANCELLED')}
              >
                Đã hủy ({cancelledTodayCount})
              </button>
            </div>
            <button
              type="button"
              className="staff-history-refresh"
              disabled={todayLoading}
              onClick={() => void loadToday()}
            >
              Tải lại
            </button>
          </div>
          {todayLoading && <p role="status">Đang tải đơn hôm nay…</p>}
          {todayError && (
            <p className="staff-board-error" role="alert">
              {todayError}{' '}
              <button type="button" onClick={() => void loadToday()}>
                Thử lại
              </button>
            </p>
          )}
          {!todayLoading && !todayError && filteredToday.length === 0 && (
            <p className="staff-board-empty">Chưa có đơn hoàn tất hoặc hủy hôm nay.</p>
          )}
          {!todayLoading && !todayError && filteredToday.length > 0 && (
            <div className="staff-history-list">
              {filteredToday.map((order) => {
                const refunded = order.payments.some((p) => p.refund?.status === 'SUCCESS');
                const badgeClass =
                  order.status === 'COMPLETED'
                    ? 'completed'
                    : refunded
                      ? 'refunded'
                      : 'cancelled';
                const badgeText =
                  order.status === 'COMPLETED'
                    ? 'Hoàn tất'
                    : refunded
                      ? 'Đã hoàn tiền'
                      : 'Đã hủy';
                return (
                  <article className="staff-history-card" key={order.id} aria-label={`Đơn ${order.orderCode}`}>
                    <div className="staff-history-head">
                      <div className="staff-history-badges">
                        <span className={`staff-history-status ${badgeClass}`}>{badgeText}</span>
                        <span className={`staff-history-channel${order.channel === 'COUNTER_POS' ? ' counter' : ''}`}>
                          {order.channel === 'COUNTER_POS'
                            ? `Tại quầy · ${order.guestLabel || 'Khách tại quầy'}`
                            : 'Online'}
                        </span>
                      </div>
                      <time dateTime={order.createdAt}>
                        {new Date(order.createdAt).toLocaleTimeString('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          hour12: false,
                        })}
                      </time>
                    </div>
                    <div className="staff-history-items">
                      {order.items.map((item) => (
                        <div className="staff-history-item" key={item.id}>
                          <span>
                            <strong>{item.productName}</strong> × {item.quantity}
                            {item.sizeName ? ` · Size ${item.sizeName}` : ''}
                            {item.toppings.length > 0
                              ? ` · ${item.toppings.map((t) => t.toppingName).join(', ')}`
                              : ''}
                          </span>
                          <span>{formatPrice(item.lineTotal)}đ</span>
                        </div>
                      ))}
                    </div>
                    <div className="staff-history-foot">
                      <span className="staff-history-code">
                        {order.orderCode} · {paymentMethodLabel(order)}
                      </span>
                      <strong>{formatPrice(order.finalTotal)}đ</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {refundTarget && (
        <CounterRefundDialog
          order={refundTarget}
          onClose={() => setRefundTarget(null)}
          onRefunded={retry}
        />
      )}
    </div>
  );
}
