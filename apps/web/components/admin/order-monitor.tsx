"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "../../services/store.service";
import { formatPrice } from "../../lib/format-price";
import { statusName } from "../orders/orders-view";
import { useAuthUser } from "../../lib/auth-store";
import { AdminOrderDetail } from "./admin-order-detail";

const money = (value: string | number | null | undefined) => value == null ? "—" : `${formatPrice(value)}đ`;
const sizeLabel = (value: string | null | undefined) => {
  const size = value?.trim();
  if (!size) return "Chưa có size";
  return /^size\b/i.test(size) ? size : `Size ${size}`;
};

export function OrderMonitor({ orders }: { orders: Order[] }) {
  const actor = useAuthUser();
  const [status, setStatus] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const selectedTriggerRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!selectedOrder) selectedTriggerRef.current?.focus();
  }, [selectedOrder]);
  const filtered = orders.filter((order) => !status || order.status === status);
  const statuses = ["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
  return <div className="order-monitor">
    <p>{orders.length} đơn trong danh sách gần nhất</p>
    <div className="account-role-filters" aria-label="Lọc trạng thái đơn">{["", ...statuses].map((value) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value ? statusName[value] : "Tất cả"}</button>)}</div>
    <div className="admin-table management-table"><table><thead><tr><th>Mã đơn</th><th>Món</th><th>Tổng tiền</th><th>Trạng thái</th></tr></thead><tbody>{filtered.map((order) => <tr className="order-monitor-main-row" key={order.id} tabIndex={0} aria-label={`Chi tiết đơn ${order.orderCode}`} aria-haspopup="dialog" aria-expanded={selectedOrder?.id === order.id}
      onClick={(event) => { selectedTriggerRef.current = event.currentTarget; setSelectedOrder(order); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectedTriggerRef.current = event.currentTarget; setSelectedOrder(order); } }}>
      <td><strong>{order.orderCode}</strong></td>
      <td>{order.items.map((item) => <div className="monitor-item" key={item.id}><strong>{item.productName}</strong><small>{sizeLabel(item.sizeName)} · {item.quantity} ly</small></div>)}</td>
      <td><strong>{money(order.finalTotal)}</strong></td>
      <td><span className={`inventory-status ${order.status === "CANCELLED" ? "muted" : order.status === "PENDING" ? "low" : "available"}`}>{statusName[order.status] ?? order.status}</span><small className="monitor-history">{order.history.map((event) => statusName[event.toStatus] ?? event.toStatus).join(" → ")}</small></td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p role="status">Không có đơn phù hợp.</p>}
    {selectedOrder && <AdminOrderDetail allowAccountLinks={actor?.role === "ADMIN"} order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
  </div>;
}
