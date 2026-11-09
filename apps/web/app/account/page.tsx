"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteFrame } from "../../components/layout/site-frame";
import { getStore, sendStore } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { useAuthUser } from "../../lib/auth-store";
import './account.css';
type Loyalty = {
  loyaltyPoints: number;
  availablePoints: number;
  reservedPoints: number;
  transactions: {
    id: string;
    type: string;
    points: number;
    balanceAfter: number;
    createdAt: string;
  }[];
};
type Notice = {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  orderId: string | null;
};
export default function AccountPage() {
  const user = useAuthUser();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(5);
  const [saving, setSaving] = useState(false);
  async function markRead(id?: string) {
    if (saving) return;
    setSaving(true);
    try {
      await sendStore(id ? `/account/notifications/${id}/read` : '/account/notifications/read-all', {}, 'patch');
      setNotices((current) => current.map((n) => !id || n.id === id ? { ...n, isRead: true } : n));
    } catch (e) { setError(authError(e)); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      getStore<Loyalty>("/account/loyalty"),
      getStore<Notice[]>("/account/notifications"),
    ])
      .then(([l, n]) => {
        if (active) {
          setLoyalty(l);
          setNotices(n);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(authError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <SiteFrame>
      <section className="section account-page">
        <div className="container account-layout">
          <h1 className="visually-hidden">Điểm thưởng và thông báo</h1>
          {loading && <p role="status">Đang tải tài khoản…</p>}
          {error && (
            <p role="alert">
              {error}{" "}
              <button onClick={() => setAttempt((a) => a + 1)}>Thử lại</button>{" "}
              <Link href="/login">Đăng nhập</Link>
            </p>
          )}
          <aside className="account-sidebar">
            {user && <div className="account-card account-identity"><span className="account-avatar" aria-hidden="true">{user.fullName.trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{user.fullName}</strong><small>{user.email}</small></div></div>}
          {!error && loyalty && (
            <div className="account-card account-loyalty">
              <h2>Điểm thưởng</h2>
              <p className="account-point-total"><strong>{loyalty.loyaltyPoints}</strong> điểm</p>
              <dl className="account-balances"><div><dt>Khả dụng</dt><dd>{loyalty.availablePoints}</dd></div><div><dt>Đang giữ</dt><dd>{loyalty.reservedPoints}</dd></div></dl>
              {!loyalty.transactions.length && (
                <div className="account-points-empty"><span aria-hidden="true">☆</span><p>Chưa có giao dịch điểm từ đơn hàng mới.</p></div>
              )}
              <ul className="account-transactions">
                {loyalty.transactions.map((t) => (
                  <li key={t.id}>
                    <span>{({ EARN: 'Tích điểm', REDEEM: 'Dùng điểm', REFUND: 'Hoàn điểm', EARN_REVERSAL: 'Thu hồi điểm từ đơn đã hủy' } as Record<string, string>)[t.type] ?? t.type}<small>{new Date(t.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small></span><strong>{t.points > 0 ? '+' : ''}{t.points}<small>Số dư {t.balanceAfter}</small></strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </aside>
          {!loading && !error && (
            <div className="account-card account-notices">
              <header><h2>Thông báo {notices.some((n) => !n.isRead) && <span className="account-new-count">{notices.filter((n) => !n.isRead).length} mới</span>}</h2><button disabled={saving || !notices.some((n) => !n.isRead)} onClick={() => void markRead()}>Đánh dấu tất cả đã đọc</button></header>
              {!notices.length && <p className="account-empty">Chưa có thông báo.</p>}
              {notices.slice(0, visible).map((n) => (
                <article className={`account-notice ${n.isRead ? '' : 'account-unread'}`} key={n.id}>
                  <span className="account-notice-icon" aria-hidden="true">✓</span>
                  <div className="account-notice-text"><h3>{n.title}{!n.isRead && <i aria-label="Chưa đọc"/>}</h3><p>{n.content}</p></div>
                  {n.orderId && (
                    <Link className="account-order-link" href={`/orders/${n.orderId}`}>Xem đơn hàng</Link>
                  )}
                  {!n.isRead && (
                    <button
                      className="account-read" disabled={saving} onClick={() => void markRead(n.id)}
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </article>
              ))}
              {visible < notices.length && <button className="account-more" onClick={() => setVisible((count) => count + 5)}>Xem thêm thông báo</button>}
            </div>
          )}
        </div>
      </section>
    </SiteFrame>
  );
}
