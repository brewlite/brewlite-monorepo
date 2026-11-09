"use client";
import Link from 'next/link';
import { CenteredDialog } from '../ui/centered-dialog';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Order } from '../../services/store.service';
import { formatPrice } from '../../lib/format-price';
import './customer-orders.css';

const time = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const date = (value: string) => new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const money = (value: string | number) => `${formatPrice(value)}đ`;
function Cup() { return <span className="co-cup" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8ZM17 9h2a3 3 0 0 1 0 6h-2M8 3v2m4-3v3m4-2v2"/></svg></span>; }
function PaymentIcon({ card }: { card: boolean }) { return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{card ? <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></> : <><path d="M4 7V5a2 2 0 0 1 2-2h12v4M4 7h16v14H4z"/><path d="M15 12h5v5h-5z"/></>}</svg>; }
const paymentName = (p: Order['payments'][number]) => p.providerPaymentId?.startsWith('vnpay:') ? 'VNPay Sandbox' : p.method === 'WALLET' ? 'Ví mô phỏng' : 'Thẻ mô phỏng';
function Badge({ status, names }: { status: string; names: Record<string, string> }) { return <span className={`co-badge co-${status.toLowerCase()}`}><i />{names[status] ?? status}</span>; }
type Props = { now: number; id?: string; orders: Order[]; user: { fullName: string; loyaltyPoints: number } | null; loading: boolean; error: string; pending: boolean; names: Record<string, string>; retry: () => void; action: (o: Order, name: string, body: object) => void; vnpay: (o: Order) => Promise<void> };
export function CustomerOrders({ now, id, orders, user, loading, error, pending, names, retry, action, vnpay }: Props) {
  const [filter, setFilter] = useState('ALL');
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const filters = [['ALL', 'Tất cả'], ['PENDING', 'Chờ thanh toán'], ['PAYMENT_FAILED', 'Thanh toán thất bại'], ['PAID', 'Đã thanh toán'], ['CANCELLED', 'Đã hủy']];
  const matches = (o: Order, status: string) => status === 'ALL' || (status === 'PAID' ? ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(o.status) : o.status === status);
  const groups = new Map<string, Order[]>();
  for (const o of [...orders].filter((o) => matches(o, filter)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const key = date(o.createdAt); groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const today = date(new Date(now).toISOString());
  const yesterday = date(new Date(now - 86400000).toISOString());
  return <div className="customer-orders">
    <header className="co-heading"><div><h1>{id ? 'Chi tiết đơn hàng' : 'Lịch sử đơn hàng'}</h1>{user && <p>{user.fullName} · {user.loyaltyPoints} điểm thưởng</p>}</div>{id && <Link className="co-back" href="/orders">‹ &nbsp; Về lịch sử đơn hàng</Link>}</header>
    {loading && <p role="status">Đang tải đơn từ máy chủ…</p>}
    {error && <p className="co-notice" role="alert">{error} <button onClick={retry}>Thử lại</button>{!user && <Link href="/login">Đăng nhập</Link>}</p>}
    {!loading && !error && !orders.length && <p className="co-empty">Chưa có đơn hàng phù hợp.</p>}
    {!id && <><nav className="co-filters" aria-label="Lọc trạng thái đơn hàng">{filters.map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} · {orders.filter((o) => matches(o, key)).length}</button>)}</nav>
      {!loading && orders.length > 0 && !groups.size && <p className="co-empty">Chưa có đơn hàng trong trạng thái này.</p>}
      {[...groups].map(([day, rows]) => <section className="co-day" key={day}><h2>{day === today ? `Hôm nay · ${day}` : day === yesterday ? `Hôm qua · ${day}` : day}</h2>{rows.map((o) => <article className="co-row" key={o.id}><Link className="co-row-main" href={`/orders/${o.id}`}><Cup/><span><strong>{o.orderCode}</strong><small>{time(o.createdAt)}</small></span></Link><Badge status={["PENDING", "PAYMENT_FAILED"].includes(o.status) && !!o.expiresAt && Date.parse(o.expiresAt) <= now ? "EXPIRED" : o.status} names={{ ...names, EXPIRED: "Hết hạn" }}/><strong className="co-price">{money(o.finalTotal)}</strong>{['PENDING', 'PAYMENT_FAILED'].includes(o.status) && !!o.expiresAt && Date.parse(o.expiresAt) > now && <Link className="co-pay-link" href={`/orders/${o.id}`}>Thanh toán</Link>}<Link className="co-chevron" href={`/orders/${o.id}`} aria-label={`Xem đơn ${o.orderCode}`}>›</Link></article>)}</section>)}
    </>}
    {id && orders.map((o) => {
      const unresolved = o.payments.some((p) => ['PENDING', 'UNKNOWN'].includes(p.status));
      const expired = !o.expiresAt || Date.parse(o.expiresAt) <= now;
      const cannotPay = pending || unresolved || expired || o.payments.length >= 3;
      const discounts = Number(o.discountAmount ?? 0) + Number(o.pointsDiscount ?? 0);
      const successfulPayment = o.payments.find((p) => p.status === 'SUCCESS');
      const paid = ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(o.status) && !!successfulPayment;
      const cancelled = o.status === 'CANCELLED';
      return <div className={`co-detail ${cancelled ? 'co-detail-cancelled' : ''}`} key={o.id}>
        <article className="co-card co-order-info"><div className="co-order-meta"><div><small>Mã đơn hàng</small><h2>{o.orderCode}</h2><small>Đặt lúc {time(o.createdAt)} · {date(o.createdAt)}</small></div><Badge status={["PENDING", "PAYMENT_FAILED"].includes(o.status) && !!o.expiresAt && Date.parse(o.expiresAt) <= now ? "EXPIRED" : o.status} names={{ ...names, EXPIRED: "Hết hạn" }}/></div>
          {['PENDING', 'PAYMENT_FAILED'].includes(o.status) && <p className="co-notice"><span aria-hidden="true">ⓘ</span> {expired ? 'Đã hết hạn thanh toán.' : <>Đơn được giữ đến <strong>{time(o.expiresAt!)}</strong>.</>} Thanh toán bằng Ví/Thẻ mô phỏng, không thu tiền thật.</p>}
          {paid && successfulPayment && <p className="co-notice co-notice-success" role="status"><span aria-hidden="true">✓</span> Đã thanh toán thành công qua {paymentName(successfulPayment)}.</p>}
          {cancelled && <p className="co-notice co-notice-cancelled" role="status"><span aria-hidden="true">⊗</span> <strong>Đơn đã bị hủy.</strong> {o.payments.length === 0 ? 'Không có khoản thanh toán nào được thực hiện cho đơn này.' : successfulPayment?.refund?.status === 'SUCCESS' && successfulPayment.refund.provider === 'MOCK' ? 'Đã hoàn tiền mô phỏng và khôi phục tài nguyên. Không có tiền thật được chuyển.' : successfulPayment ? 'Đã ghi nhận thanh toán. Vui lòng liên hệ cửa hàng để xử lý; trạng thái hủy không phải xác nhận hoàn tiền.' : unresolved ? 'Giao dịch đang được xác minh. Vui lòng liên hệ cửa hàng.' : 'Chưa có thanh toán thành công được ghi nhận.'}</p>}
          <h3>Sản phẩm</h3><ul className="co-items">{o.items.map((item) => <li key={item.id}><Cup/><div><strong>{item.productName}</strong><small>Size {item.sizeName} · {item.quantity} ly · {item.toppings.map((t) => t.toppingName).join(', ') || 'Không topping'}</small>{item.note && <small>Ghi chú: {item.note}</small>}</div><strong>{money(item.lineTotal)}</strong></li>)}</ul>
          <h3>Lịch sử đơn</h3><ol className="co-timeline">{o.history.map((h, index) => <li className={`co-history-${h.toStatus.toLowerCase()} ${index === o.history.length - 1 ? 'co-history-current' : ''}`} key={`${h.createdAt}-${index}`}><strong>{names[h.toStatus] ?? h.toStatus}</strong><small>{time(h.createdAt)} · {date(h.createdAt)}</small>{h.toStatus === 'PAID' && successfulPayment && <small>Qua {paymentName(successfulPayment)}</small>}</li>)}</ol>
          <h3>Các lần thanh toán</h3>
          {!o.payments.length ? <p className="co-attempt-empty">Chưa có lần thanh toán nào.</p> : <ol className="co-attempts">{[...o.payments].sort((a, b) => (a.attemptNumber ?? 0) - (b.attemptNumber ?? 0)).map((p, index) => <li key={p.id}><div><strong>Lần {p.attemptNumber ?? index + 1} · {paymentName(p)}</strong><small>{p.createdAt ? `${time(p.createdAt)} · ${date(p.createdAt)}` : '—'}</small></div><span className={`co-payment-status co-payment-${p.status.toLowerCase()}`}>{({ SUCCESS: 'Thành công', FAILED: 'Thất bại', UNKNOWN: 'Đang xác minh', PENDING: 'Đang chờ' } as Record<string, string>)[p.status] ?? p.status}</span></li>)}</ol>}
        </article>
        <aside className="co-card co-payment"><h2>Thanh toán</h2><dl><div><dt>Tạm tính</dt><dd>{money(o.subtotal ?? Number(o.finalTotal) + discounts)}</dd></div><div><dt>Giảm giá</dt><dd>{money(discounts)}</dd></div><div className="co-total"><dt>Tổng cộng</dt><dd>{money(o.finalTotal)}</dd></div></dl>
          {['PENDING', 'PAYMENT_FAILED'].includes(o.status) && o.payments.length >= 3 && !unresolved && <p role="status">Đã hết 3 lần thanh toán. Vui lòng hủy đơn và đặt đơn mới.</p>}
          {o.payments.map((p) => <div className="co-payment-event" key={p.id}><div className="co-method-card"><PaymentIcon card={p.method === 'CARD'}/><div><strong>{paymentName(p)}</strong><small>{p.providerPaymentId?.startsWith('vnpay:') ? 'Môi trường Sandbox' : 'Mô phỏng · không thu tiền thật'}</small></div><span className={`co-payment-status co-payment-${p.status.toLowerCase()}`}>{({ SUCCESS: 'Thành công', FAILED: 'Thất bại', UNKNOWN: 'Đang xác minh', PENDING: 'Đang chờ' } as Record<string, string>)[p.status] ?? p.status}</span></div>{['PENDING', 'UNKNOWN'].includes(p.status) && <Link className="co-result-link" href={`/payments/result?paymentId=${p.id}`}>Kiểm tra lại kết quả</Link>}</div>)}
          {o.status === 'PAID' && successfulPayment && !unresolved && !successfulPayment.refund && !successfulPayment.providerPaymentId?.startsWith('vnpay:') && <button className="co-cancel" disabled={pending} onClick={() => setCancelTarget(o)}>Hủy đơn và hoàn tiền mô phỏng</button>}
          {o.status === 'PAID' && successfulPayment?.providerPaymentId?.startsWith('vnpay:') && <p role="status">Chưa hỗ trợ hủy và hoàn tiền VNPay trực tuyến. Vui lòng liên hệ cửa hàng.</p>}
          {o.payments.filter(p => p.refund).map(p => <p role="status" key={`refund-${p.id}`}>{p.refund?.status === 'SUCCESS' && p.refund.provider === 'MOCK' ? `Đã hoàn tiền mô phỏng: ${money(p.refund.amount)}` : `Hoàn tiền đang được xử lý: ${p.refund?.status}`}</p>)}
          {cancelled && <Link className="co-menu-link" href="/menu">Về thực đơn</Link>}
          {['PENDING', 'PAYMENT_FAILED'].includes(o.status) && <div className="co-payment-actions">{unresolved && <p role="status">Đang xác minh giao dịch. Vui lòng không thanh toán lại.</p>}{!expired && ['WALLET', 'CARD'].map((method) => <button key={method} className={method === 'WALLET' ? 'co-primary' : 'co-secondary'} disabled={cannotPay} onClick={() => action(o, 'payments', { method })}><span aria-hidden="true">{method === 'WALLET' ? '▣' : '▤'}</span> Thanh toán bằng {method === 'WALLET' ? 'Ví mô phỏng' : 'Thẻ mô phỏng'}</button>)}{!expired && process.env.NEXT_PUBLIC_ENABLE_VNPAY_SANDBOX === 'true' && <button disabled={cannotPay} className="co-secondary" onClick={() => void vnpay(o)}>Thanh toán VNPay Sandbox</button>}<button className="co-cancel" disabled={pending || unresolved} onClick={() => action(o, 'cancel', {})}>Hủy đơn</button></div>}
        </aside>
      </div>;
    })}
    {cancelTarget && createPortal(<CenteredDialog className="refund-dialog" label="Hủy đơn đã thanh toán" onClose={() => { if (!pending) setCancelTarget(null); }}>
      <div className="refund-confirmation"><h2>Hủy đơn và hoàn tiền mô phỏng?</h2>
        <p>Đơn {cancelTarget.orderCode} sẽ bị hủy nếu nhân viên chưa bắt đầu pha chế.</p>
        <p>Hoàn {money(cancelTarget.finalTotal)} qua mô phỏng, trả tồn kho và lượt mã giảm giá, hoàn điểm đã dùng và thu hồi điểm tích từ đơn. Không chuyển tiền thật.</p>
        <div className="refund-confirm-actions"><button type="button" className="refund-secondary" onClick={() => setCancelTarget(null)} disabled={pending}>Giữ đơn</button><button type="button" className="refund-primary" disabled={pending} onClick={() => { action(cancelTarget, 'cancel', { expectedVersion: cancelTarget.version }); setCancelTarget(null); }}>Hủy và hoàn tiền mô phỏng</button></div>
      </div>
    </CenteredDialog>, document.body)}
  </div>;
}
