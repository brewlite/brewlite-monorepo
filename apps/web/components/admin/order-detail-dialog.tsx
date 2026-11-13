"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "../../lib/format-price";
import { getStore, type Order } from "../../services/store.service";
import { CenteredDialog } from "../ui/centered-dialog";
import { statusName } from "../orders/orders-view";

export function AdminOrderDetailContent({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getStore<Order>(`/admin/orders/${encodeURIComponent(orderId)}`)
      .then((value) => {
        if (!value || !Array.isArray(value.items)) throw new Error("Invalid order response");
        if (active) {
          setOrder(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [orderId, attempt]);

  const staff = (order?.history ?? [])
    .map((event) => event.actor)
    .filter((actor): actor is NonNullable<typeof actor> => Boolean(actor && ["STAFF", "ADMIN"].includes(actor.role)))
    .filter((actor, index, actors) => actors.findIndex((item) => item.id === actor.id) === index);
  return <div className="admin-order-detail-content">
      {error && <p role="alert">Không thể tải chi tiết đơn hàng. <button type="button" onClick={() => { setError(false); setLoading(true); setAttempt((value) => value + 1); }}>Thử lại</button></p>}
      {loading && <p role="status">Đang tải chi tiết đơn hàng…</p>}
      {order && <div className="admin-order-detail-content">
        <p><strong>{order.orderCode}</strong></p>
        <p>{statusName[order.status] ?? order.status} · {new Date(order.createdAt).toLocaleString("vi-VN")}</p>
        {order.user && <p>Khách hàng: {order.user.fullName || order.user.email}</p>}
        {staff.length > 0 && <p>Nhân viên xử lý: {staff.map((actor) => actor.fullName || actor.email).join(", ")}</p>}
        <div className="admin-order-detail-items">
          {order.items.map((item) => <div key={item.id}>
            <strong>{item.productName}</strong>
            <span>{item.sizeName} · {item.quantity} ly · {formatPrice(item.lineTotal)}đ</span>
            {item.toppings.length > 0 && <span>Topping: {item.toppings.map((topping) => topping.toppingName).join(", ")}</span>}
            {item.note && <span>Ghi chú: {item.note}</span>}
          </div>)}
        </div>
        <p className="admin-order-detail-total"><strong>Tổng thanh toán: {formatPrice(order.finalTotal)}đ</strong></p>
      </div>}
    </div>;
}

export function AdminOrderDetailDialog({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  return <CenteredDialog className="admin-order-detail-dialog" label="Chi tiết đơn hàng" onClose={onClose}>
    <div className="admin-order-detail">
      <button type="button" className="admin-user-details-close" aria-label="Đóng chi tiết đơn hàng" onClick={onClose}>×</button>
      <h2>Chi tiết đơn hàng</h2>
      <AdminOrderDetailContent orderId={orderId} />
    </div>
  </CenteredDialog>;
}
