"use client";
import { formatPrice } from "../../lib/format-price";
import { statusName } from "../orders/orders-view";
export function shortOrderCode(code: string) { return code.replace(/^BL-\d+-([a-zA-Z0-9]+)$/, "#$1"); }
export function accountDateTime(value: string) { return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }); }
export function AccountOrderStatus({ status }: { status: string }) { return <span className={`account-order-status status-${status.toLowerCase()}`}>{statusName[status] ?? status}</span>; }
type AccountOrder = { id: string; orderCode: string; createdAt: string; status: string; finalTotal: string };
export function AccountOrderList({ orders, onOpenOrder }: { orders: AccountOrder[]; onOpenOrder: (id: string) => void }) {
  return <div className="account-order-list">{orders.map((order) => <button type="button" className="account-order-row" key={order.id} aria-label={`Xem chi tiết đơn ${order.orderCode}`} title={order.orderCode} onClick={() => onOpenOrder(order.id)}>
    <span className="account-order-identity"><strong>{shortOrderCode(order.orderCode)}</strong><time dateTime={order.createdAt}>{accountDateTime(order.createdAt)}</time></span>
    <span className="account-order-amount"><AccountOrderStatus status={order.status} /><strong>{formatPrice(order.finalTotal)}đ</strong></span><span className="account-order-chevron" aria-hidden="true">›</span>
  </button>)}</div>;
}
