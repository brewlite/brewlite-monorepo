"use client";
import { useEffect, useState } from "react";
import { getStore } from "../../services/store.service";
import { AccountOrderStatus, shortOrderCode, accountDateTime } from "./account-order-list";
import { statusName } from "../orders/orders-view";
export type StaffActivity = {
  participatedOrders: number; totalUpdates: number;
  transitions: { status: string; count: number }[];
  recentEvents: { id: string; fromStatus: string | null; toStatus: string; createdAt: string; order: { id: string; orderCode: string; status: string } }[];
};
export function AdminStaffActivity({ userId, onOpenOrder }: { userId: string; onOpenOrder: (id: string) => void }) {
  const [data, setData] = useState<StaffActivity | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getStore<StaffActivity>(`/admin/users/${encodeURIComponent(userId)}/activity`).then((value) => {
      if (!value || !Number.isInteger(value.participatedOrders) || !Number.isInteger(value.totalUpdates) || !Array.isArray(value.recentEvents) || !Array.isArray(value.transitions)) throw new Error("Invalid activity response");
      if (active) setData(value);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [userId, attempt]);
  const workflowOrder = ["PREPARING", "READY", "COMPLETED"];
  const transitions = data ? [...data.transitions].sort((a, b) => {
    const left = workflowOrder.indexOf(a.status);
    const right = workflowOrder.indexOf(b.status);
    return (left < 0 ? workflowOrder.length : left) - (right < 0 ? workflowOrder.length : right);
  }) : [];
  return <section className="admin-staff-activity"><h3>Hoạt động xử lý đơn</h3>
    {!data && !error && <p role="status">Đang tải hoạt động nhân viên…</p>}
    {error && <p role="alert">Không thể tải hoạt động nhân viên. <button type="button" onClick={() => { setError(false); setData(null); setAttempt((value) => value + 1); }}>Thử lại</button></p>}
    {data && <><div className="account-stat-grid staff-stat-grid"><div><strong>{data.participatedOrders}</strong><span>Đơn đã tham gia xử lý</span></div><div><strong>{data.totalUpdates}</strong><span>Lượt cập nhật trạng thái</span></div></div>
      <div className="staff-transition-bars">{transitions.map((entry) => <div className="staff-transition-row" key={entry.status}><span>{statusName[entry.status] ?? entry.status}</span><span className="staff-transition-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, entry.count / Math.max(1, data.totalUpdates) * 100))}%` }} /></span><strong>{entry.count} lần</strong></div>)}</div>
      <h3>Nhật ký cập nhật gần đây</h3>
      {!data.recentEvents.length ? <p>Chưa có hoạt động xử lý đơn.</p> : <ul className="account-staff-events">{data.recentEvents.map((event) => <li key={event.id}><button type="button" className="account-staff-event" aria-label={`Xem chi tiết đơn ${event.order.orderCode}, ${statusName[event.toStatus] ?? event.toStatus}`} title={event.order.orderCode} onClick={() => onOpenOrder(event.order.id)}><span className="account-staff-event-top"><strong>{shortOrderCode(event.order.orderCode)}</strong><time dateTime={event.createdAt}>{accountDateTime(event.createdAt)}</time></span><span className="account-staff-event-status">{event.fromStatus && <><AccountOrderStatus status={event.fromStatus} /><span aria-hidden="true">→</span></>}<AccountOrderStatus status={event.toStatus} /></span></button></li>)}</ul>}
    </>}

  </section>;
}
