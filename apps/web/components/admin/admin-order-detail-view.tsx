"use client";
import { useEffect, useRef } from "react";
import type { Order } from "../../services/store.service";
import { formatPrice } from "../../lib/format-price";
import { statusName } from "../orders/orders-view";
import "./admin-order-detail.css";

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
  CASH: "Tiền mặt tại quầy",
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
  return <div className="admin-order-sum-row"><dt>{label}</dt><dd>{children}</dd></div>;
}
export function AdminOrderDetailView({ order, onClose, onBack, onOpenAccount }: {
  order: Order; onClose: () => void; onBack?: () => void; onOpenAccount?: (id: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  const allowAccountLinks = !!onOpenAccount;
  const staffEvent = [...order.history].filter((event) => event.actor && ["STAFF", "ADMIN"].includes(event.actor.role)).sort((a, b) => (b.orderVersion ?? 0) - (a.orderVersion ?? 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const staff = staffEvent?.actor;
  const hasDiscount = !!order.couponCodeSnapshot || Number(order.discountAmount ?? 0) > 0 || Number(order.pointsDiscount ?? 0) > 0 || Number(order.pointsUsed ?? 0) > 0;
  return <>
    <header className="admin-order-head">
      <div className="admin-order-top">{onBack && <button type="button" className="admin-order-back" aria-label="Quay lại" onClick={onBack}><span aria-hidden="true">←</span> Quay lại</button>}<h2>Chi tiết đơn hàng</h2><button ref={closeRef} type="button" className="admin-order-close" aria-label="Đóng chi tiết đơn hàng" onClick={onClose}>×</button></div>
      <div className="admin-order-meta"><strong>{order.orderCode}</strong><span className={`admin-order-badge status-${order.status.toLowerCase()}`}>{statusName[order.status] ?? order.status}</span><time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time></div>
    </header>
    <div className="admin-order-body">
      <section><h3>Người liên quan</h3><div className="admin-order-people">
        <article className="admin-order-person"><p className="admin-order-caption">Khách hàng</p>{order.user ? <>{allowAccountLinks ? <button type="button" className="admin-account-link" aria-label={`Xem tài khoản khách hàng ${order.user.fullName || order.user.email}`} onClick={() => onOpenAccount?.(order.user!.id)}>{order.user.fullName || order.user.email}</button> : <strong>{order.user.fullName || order.user.email}</strong>}<p>{order.user.email}</p><code>ID: {order.user.id}</code></> : order.channel === "COUNTER_POS" ? <><strong>{order.guestLabel || "Khách tại quầy"}</strong><p>Khách tại quầy</p></> : <p>Chưa có thông tin khách hàng.</p>}</article>
        <article className="admin-order-person"><p className="admin-order-caption">Người cập nhật gần nhất</p>{staff ? <>{allowAccountLinks ? <button type="button" className="admin-account-link" aria-label={`Xem tài khoản người cập nhật ${staff.fullName || staff.email}`} onClick={() => onOpenAccount?.(staff.id)}>{staff.fullName || staff.email}</button> : <strong>{staff.fullName || staff.email}</strong>}<p>{staff.role === "ADMIN" ? "Quản trị viên" : "Nhân viên"}</p><code>ID: {staff.id}</code></> : <p>Chưa ghi nhận nhân viên hoặc quản trị viên cập nhật.</p>}</article>
      </div></section>
      {order.note && <p className="admin-order-note">Ghi chú đơn: {order.note}</p>}
      <section><h3>Sản phẩm</h3><ul className="admin-order-items">{order.items.map((item) => <li key={item.id}><div><strong>{item.productName}</strong><p>{sizeLabel(item.sizeName)} · {item.quantity} ly · Đơn giá: {money(item.unitPrice)}</p>{!!item.toppings.length && <p>Topping: {item.toppings.map((topping) => `${topping.toppingName} (${money(topping.price)})`).join(", ")}</p>}{item.note && <p>Ghi chú: {item.note}</p>}</div><strong className="admin-order-item-price">Thành tiền: {money(item.lineTotal)}</strong></li>)}</ul>
      <dl className="admin-order-summary">
        {(order.items.length > 1 || hasDiscount) && order.subtotal != null && <DetailRow label="Tạm tính">{money(order.subtotal)}</DetailRow>}
        {!!order.couponCodeSnapshot && <DetailRow label="Mã giảm giá">{order.couponCodeSnapshot}</DetailRow>}
        {Number(order.discountAmount ?? 0) > 0 && <DetailRow label="Giảm giá">{money(order.discountAmount)}</DetailRow>}
        {Number(order.pointsDiscount ?? 0) > 0 && <DetailRow label="Giảm bằng điểm">{money(order.pointsDiscount)}</DetailRow>}
        {Number(order.pointsUsed ?? 0) > 0 && <DetailRow label="Điểm sử dụng">{order.pointsUsed} điểm</DetailRow>}
        <DetailRow label="Tổng thanh toán"><strong>{money(order.finalTotal)}</strong></DetailRow>
      </dl></section>
      <section><h3>Thanh toán</h3>{order.payments.length ? <ul className="admin-order-payments">{order.payments.map((payment) => <li key={payment.id}><div><strong>{paymentMethodName(payment.method)} · {paymentStatusName(payment.status)}</strong><span>{money(payment.amount)}{payment.attemptNumber != null ? ` · Lần ${payment.attemptNumber}` : ""}</span></div>{payment.createdAt && <time dateTime={payment.createdAt}>{dateTime(payment.createdAt)}</time>}</li>)}</ul> : <p>Chưa có giao dịch thanh toán.</p>}</section>
      <section><h3>Lịch sử trạng thái</h3>{order.history.length ? <ol className="admin-order-timeline">{order.history.map((event, index) => <li key={`${event.createdAt}-${index}`} className={index === order.history.length - 1 ? "current" : ""}><div><strong>{statusName[event.toStatus] ?? event.toStatus}</strong>{event.fromStatus && <p>Từ: {statusName[event.fromStatus] ?? event.fromStatus}</p>}<p>Bởi: {event.actor ? `${event.actor.fullName || event.actor.email} (${event.actor.role === "ADMIN" ? "Quản trị viên" : event.actor.role === "STAFF" ? "Nhân viên" : "Khách hàng"})` : event.actorId ? "Chưa có thông tin người thực hiện" : "Hệ thống"}</p></div><time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time></li>)}</ol> : <p>Chưa có lịch sử trạng thái.</p>}</section>
    </div>
  </>;
}
