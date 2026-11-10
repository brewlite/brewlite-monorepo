"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from "react";
import { getStore, sendStore, type Order } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { useAuthUser, refreshAuth } from "../../lib/auth-store";
import { startVNPay, startMockPayment } from '../../services/payment.service';
import { CustomerOrders } from './customer-orders';
import './staff-order-board.css';
import { StaffOrderBoard } from './staff-order-board';
export const statusName: Record<string, string> = {
  PENDING: "Chờ thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  PAID: "Đã thanh toán",
  PREPARING: "Đang pha chế",
  READY: "Sẵn sàng nhận",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};
export function OrdersView({
  id,
  staff = false,
}: {
  id?: string;
  staff?: boolean;
}) {
  const user = useAuthUser();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(0);
  const keys = useRef(new Map<string, string>());
  const endpoint = staff ? "/staff/orders" : id ? `/orders/${id}` : "/orders";
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    let shouldPoll = true;
    let lastLoad = 0;
    async function load() {
      if (!active || inFlight) return;
      clearTimeout(timer);
      if (document.hidden) return;
      inFlight = true;
      lastLoad = Date.now();
      try {
        const data = await getStore<Order | Order[]>(endpoint);
        if (active) {
          const rows = Array.isArray(data) ? data : [data];
          shouldPoll = staff || rows.some((o) => !['COMPLETED', 'CANCELLED'].includes(o.status));
          setOrders(rows);
          setNow(Date.now());
          setError("");
        }
      } catch (e) {
        if (active) setError(authError(e));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
        if (active && shouldPoll && !document.hidden) timer = setTimeout(() => void load(), 15000);
      }
    }
    const resume = () => {
      if (!document.hidden && Date.now() - lastLoad >= 15000) void load();
    };
    void load();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [endpoint, attempt, staff]);
  async function action(
    order: Order,
    name: string,
    body: object,
    method: "post" | "patch" = "post",
  ) {
    const operation = `${order.id}:${order.version}:${name}:${JSON.stringify(body)}`;
    const key = keys.current.get(operation) || crypto.randomUUID();
    keys.current.set(operation, key);
    setPending(true);
    setError("");
    try {
      const result = !staff && name === 'payments' ? await startMockPayment(order.id, (body as { method: 'WALLET' | 'CARD' }).method) : await sendStore<{ id?: string }>(
        staff
          ? `/staff/orders/${order.id}/status`
          : `/orders/${order.id}/${name}`,
        body,
        method,
        key,
      );
      keys.current.delete(operation);
      if (!staff && name === 'payments' && result?.id) router.push(`/payments/result?paymentId=${encodeURIComponent(result.id)}`);
      setAttempt((a) => a + 1);
      if (!staff) void refreshAuth();
    } catch (e) {
      setError(authError(e));
    } finally {
      setPending(false);
    }
  }
  if (!staff) return <CustomerOrders now={now} id={id} orders={orders} user={user} loading={loading} error={error} pending={pending} names={statusName} retry={() => setAttempt((a) => a + 1)} action={(o, name, body) => void action(o, name, body)} vnpay={async (o) => {
    setPending(true); setError('');
    try { const result = await startVNPay(o.id); if (result.url) window.location.assign(result.url); else setAttempt((value) => value + 1); }
    catch (caught) { setError(authError(caught)); } finally { setPending(false); }
  }} />;
  return <StaffOrderBoard orders={orders} user={user} loading={loading} pending={pending} error={error} retry={() => setAttempt((a) => a + 1)} update={(order, nextStatus) => void action(order, 'status', { nextStatus, expectedVersion: order.version }, 'patch')} />;
}
