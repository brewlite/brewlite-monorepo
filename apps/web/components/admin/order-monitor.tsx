"use client";
import { useState } from "react";
import type { Order } from "../../services/store.service";
import { formatPrice } from "../../lib/format-price";
import { statusName } from "../orders/orders-view";

export function OrderMonitor({ orders }: { orders: Order[] }) {
  const [status, setStatus] = useState("");
  const [opened, setOpened] = useState<string | null>(null);
  const filtered = orders.filter((order) => !status || order.status === status);
  const statuses = ["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
  return <div className="order-monitor">
    <p>{orders.length} đơn trong danh sách gần nhất</p>
    <div className="account-role-filters" aria-label="Lọc trạng thái đơn">{["", ...statuses].map((value) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value ? statusName[value] : "Tất cả"}</button>)}</div>
    <div className="admin-table management-table"><table><thead><tr><th>Mã đơn</th><th>Món</th><th>Tổng tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}>
      <td><strong>{order.orderCode}</strong></td>
      <td>{order.items.map((item) => <div className="monitor-item" key={item.id}><strong>{item.productName}</strong><small>{item.sizeName} · {item.quantity} ly</small>{opened === order.id && <><small>{item.toppings.map((topping) => topping.toppingName).join(", ") || "Không topping"}</small>{item.note && <small>{item.note}</small>}</>}</div>)}</td>
      <td><strong>{formatPrice(order.finalTotal)}đ</strong></td>
      <td><span className={`inventory-status ${order.status === "CANCELLED" ? "muted" : order.status === "PENDING" ? "low" : "available"}`}>{statusName[order.status] ?? order.status}</span><small className="monitor-history">{order.history.map((event) => statusName[event.toStatus] ?? event.toStatus).join(" → ")}</small>
        {opened === order.id && order.payments.map((payment) => <small className="monitor-history" key={payment.id}>{payment.method} · {payment.status} · {formatPrice(payment.amount)}đ</small>)}
      </td>
      <td><button className="inventory-icon-button" aria-label={`Chi tiết đơn ${order.orderCode}`} aria-expanded={opened === order.id} onClick={() => setOpened(opened === order.id ? null : order.id)}>⌄</button></td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <p role="status">Không có đơn phù hợp.</p>}
  </div>;
}
