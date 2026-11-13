"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "../../services/store.service";
import { formatPrice } from "../../lib/format-price";
import { statusName } from "../orders/orders-view";
import { CenteredDialog } from "../ui/centered-dialog";

const dateTime = (value: string) => {
  const date = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
  const time = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return `${date} lúc ${time}`;
};
const money = (value: string | number | null | undefined) => value == null ? "—" : `${formatPrice(value)}đ`;
const paymentMethodName = (value: string | null | undefined) => ({
  WALLET: "Ví điện tử",
  CARD: "Thẻ",
}[value ?? ""] ?? value ?? "Không xác định");
const paymentStatusName = (value: string | null | undefined) => ({
  UNKNOWN: "Đang xác minh",
  PENDING: "Đang xử lý",
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
}[value ?? ""] ?? value ?? "Không xác định");
const sizeLabel = (value: string | null | undefined) => {
  const size = value?.trim();
  if (!size) return "Chưa có size";
  return /^size\b/i.test(size) ? size : `Size ${size}`;
};
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="order-monitor-detail-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function OrderMonitor({ orders }: { orders: Order[] }) {
  const [status, setStatus] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const selectedTriggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!selectedOrder) selectedTriggerRef.current?.focus();
  }, [selectedOrder]);
  const filtered = orders.filter((order) => !status || order.status === status);
  const statuses = ["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
  return <div className="order-monitor">
    <p>{orders.length} đơn trong danh sách gần nhất</p>
    <div className="account-role-filters" aria-label="Lọc trạng thái đơn">{["", ...statuses].map((value) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value ? statusName[value] : "Tất cả"}</button>)}</div>
    <div className="admin-table management-table"><table><thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Món</th><th>Tổng tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{filtered.map((order) => <tr className="order-monitor-main-row" key={order.id}>
      <td><strong>{order.orderCode}</strong></td>
      <td>{order.user?.fullName || order.user?.email || "—"}</td>
      <td>{order.items.map((item) => <div className="monitor-item" key={item.id}><strong>{item.productName}</strong><small>{sizeLabel(item.sizeName)} · {item.quantity} ly</small></div>)}</td>
      <td><strong>{money(order.finalTotal)}</strong></td>
      <td><span className={`inventory-status ${order.status === "CANCELLED" ? "muted" : order.status === "PENDING" ? "low" : "available"}`}>{statusName[order.status] ?? order.status}</span><small className="monitor-history">{order.history.map((event) => statusName[event.toStatus] ?? event.toStatus).join(" → ")}</small></td>
      <td><button className="inventory-icon-button" aria-label={`Chi tiết đơn ${order.orderCode}`} aria-expanded={selectedOrder?.id === order.id} onClick={(event) => { selectedTriggerRef.current = event.currentTarget; setSelectedOrder(order); }}>⌄</button></td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p role="status">Không có đơn phù hợp.</p>}
    {selectedOrder && <CenteredDialog label={`Chi tiết đơn ${selectedOrder.orderCode}`} className="order-monitor-detail-modal" onClose={() => setSelectedOrder(null)}>
      <div className="order-monitor-modal-content">
        <header className="order-monitor-modal-heading"><div><h2>Chi tiết đơn hàng</h2><div className="order-monitor-detail-meta"><strong>{selectedOrder.orderCode}</strong><span className={`inventory-status ${selectedOrder.status === "CANCELLED" ? "muted" : selectedOrder.status === "PENDING" ? "low" : "available"}`}>{statusName[selectedOrder.status] ?? selectedOrder.status}</span><time dateTime={selectedOrder.createdAt}>{dateTime(selectedOrder.createdAt)}</time></div></div><button type="button" className="order-monitor-modal-close" aria-label="Đóng chi tiết đơn hàng" onClick={() => setSelectedOrder(null)}>×</button></header>
        {selectedOrder.user && <section><h3>Khách hàng</h3><p>{selectedOrder.user.fullName || selectedOrder.user.email}</p></section>}
        {selectedOrder.note && <p className="order-monitor-order-note">Ghi chú đơn: {selectedOrder.note}</p>}
        <section><h3>Sản phẩm</h3><ul className="order-monitor-products">{selectedOrder.items.map((item) => <li key={item.id}><div><strong>{item.productName}</strong><span>{sizeLabel(item.sizeName)} · {item.quantity} ly{item.quantity > 1 && item.unitPrice != null ? ` · ${money(item.unitPrice)} × ${item.quantity}` : ""}</span>{item.toppings.length > 0 && <span>Topping: {item.toppings.map((topping) => `${topping.toppingName} (${money(topping.price)})`).join(", ")}</span>}{item.note && <span>Ghi chú: {item.note}</span>}</div><span className="order-monitor-line-total">Thành tiền: {money(item.lineTotal)}</span></li>)}</ul></section>
        <section className="order-monitor-summary"><h3>Tổng thanh toán</h3><dl>
          {selectedOrder.subtotal != null && (Number(selectedOrder.subtotal) !== Number(selectedOrder.finalTotal) || Boolean(selectedOrder.couponCodeSnapshot) || Number(selectedOrder.discountAmount ?? 0) > 0 || Number(selectedOrder.pointsDiscount ?? 0) > 0 || Number(selectedOrder.pointsUsed ?? 0) > 0) && <DetailRow label="Tạm tính">{money(selectedOrder.subtotal)}</DetailRow>}
          {!!selectedOrder.couponCodeSnapshot && <DetailRow label="Mã giảm giá">{selectedOrder.couponCodeSnapshot}</DetailRow>}
          {Number(selectedOrder.discountAmount ?? 0) > 0 && <DetailRow label="Giảm giá">{money(selectedOrder.discountAmount)}</DetailRow>}
          {Number(selectedOrder.pointsDiscount ?? 0) > 0 && <DetailRow label="Giảm bằng điểm">{money(selectedOrder.pointsDiscount)}</DetailRow>}
          {Number(selectedOrder.pointsUsed ?? 0) > 0 && <DetailRow label="Điểm sử dụng">{selectedOrder.pointsUsed} điểm</DetailRow>}
          <DetailRow label="Tổng thanh toán"><strong>{money(selectedOrder.finalTotal)}</strong></DetailRow>
        </dl></section>
        <section><h3>Thanh toán</h3>{selectedOrder.payments.length ? <ul className="order-monitor-events">{selectedOrder.payments.map((payment) => <li key={payment.id}><strong>{paymentMethodName(payment.method)} · {paymentStatusName(payment.status)}</strong><span>{money(payment.amount)}{payment.attemptNumber != null ? ` · Lần ${payment.attemptNumber}` : ""}</span>{payment.createdAt && <time dateTime={payment.createdAt}>{dateTime(payment.createdAt)}</time>}</li>)}</ul> : <p className="order-monitor-empty">Chưa có giao dịch thanh toán.</p>}</section>
        <section><h3>Lịch sử trạng thái</h3>{selectedOrder.history.length ? <ol className="order-monitor-events order-monitor-status-events">{selectedOrder.history.map((event, index) => <li key={`${event.createdAt}-${index}`}><strong>{statusName[event.toStatus] ?? event.toStatus}</strong>{event.actor && ["STAFF", "ADMIN"].includes(event.actor.role) && <span>Nhân viên: {event.actor.fullName || event.actor.email}</span>}{event.fromStatus && <span>Từ: {statusName[event.fromStatus] ?? event.fromStatus}</span>}<time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time></li>)}</ol> : <p className="order-monitor-empty">Chưa có lịch sử trạng thái.</p>}</section>
      </div>
    </CenteredDialog>}
  </div>;
}
