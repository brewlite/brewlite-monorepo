"use client";
import { useState } from "react";
import type { Order } from "../../services/store.service";
import { CenteredDialog } from "../ui/centered-dialog";
import { AdminLinkedAccountDialog } from "./admin-linked-account-dialog";
import { AdminOrderDetailView } from "./admin-order-detail-view";
export function AdminOrderDetail({ order, onClose, allowAccountLinks = false }: { order: Order; onClose: () => void; allowAccountLinks?: boolean }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  return <><CenteredDialog label={`Chi tiết đơn ${order.orderCode}`} className="admin-order-detail-dialog" onClose={onClose}>
    <AdminOrderDetailView order={order} onClose={onClose} onOpenAccount={allowAccountLinks ? setAccountId : undefined} />
  </CenteredDialog>{accountId && allowAccountLinks && <AdminLinkedAccountDialog key={accountId} userId={accountId} onClose={() => setAccountId(null)} />}</>;
}
