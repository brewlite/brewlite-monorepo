"use client";
import { useEffect, useState } from "react";
import { getStore, type Order } from "../../services/store.service";
import { CenteredDialog } from "../ui/centered-dialog";
import { AdminOrderDetailView } from "./admin-order-detail-view";
export function AdminOrderDetailContent({ orderId, onClose, onBack, onOpenAccount }: {
  orderId: string; onClose: () => void; onBack?: () => void; onOpenAccount?: (id: string) => void;
}) {
  const [result, setResult] = useState<{ id: string; order: Order | null; error: boolean } | null>(null);
  const order = result?.id === orderId ? result.order : null;
  const error = result?.id === orderId && result.error;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getStore<Order>(`/admin/orders/${encodeURIComponent(orderId)}`).then((value) => {
      if (!value || value.id !== orderId || !Array.isArray(value.items) || !Array.isArray(value.payments) || !Array.isArray(value.history)) throw new Error("Invalid order response");
      if (active) setResult({ id: orderId, order: value, error: false });
    }).catch(() => { if (active) setResult({ id: orderId, order: null, error: true }); });
    return () => { active = false; };
  }, [orderId, attempt]);
  if (order) return <AdminOrderDetailView order={order} onClose={onClose} onBack={onBack} onOpenAccount={onOpenAccount} />;
  return <><header className="admin-order-head"><div className="admin-order-top">{onBack && <button type="button" className="admin-order-back" aria-label="Quay lại" onClick={onBack}><span aria-hidden="true">←</span> Quay lại</button>}<h2>Chi tiết đơn hàng</h2><button type="button" className="admin-order-close" aria-label="Đóng chi tiết đơn hàng" onClick={onClose}>×</button></div></header>
    <div className="admin-order-body">{error ? <p role="alert">Không thể tải chi tiết đơn hàng. <button type="button" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>Thử lại</button></p> : <p role="status">Đang tải chi tiết đơn hàng…</p>}</div></>;
}
export function AdminOrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  return <CenteredDialog className="admin-order-detail-dialog" label="Chi tiết đơn hàng" onClose={onClose}><AdminOrderDetailContent key={orderId} orderId={orderId} onClose={onClose} /></CenteredDialog>;
}
