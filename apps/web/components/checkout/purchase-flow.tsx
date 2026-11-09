"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCheckoutOrder, pendingCheckout } from '../../services/checkout.service';
import LoginForm from "../auth/login-form";
import { CenteredDialog } from "../ui/centered-dialog";
import {
  currentUser,
  authError,
  type AuthUser,
} from "../../services/auth.service";
import { calculateQuote, type PriceQuote } from "../../services/quote.service";
import { formatPrice } from "../../lib/format-price";
import { useCart } from "../cart/cart-provider";

export function PurchaseFlow({ onClose }: { onClose: () => void }) {
  const { lines, subtotal, version, ready, reload, canCheckout } = useCart();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [coupon, setCoupon] = useState("");
  const [points, setPoints] = useState(0);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteError, setQuoteError] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [pending, setPending] = useState(false);
  const validPoints = !!user && Number.isInteger(points) && points >= 0 && points <= user.loyaltyPoints;
  const [result, setResult] = useState<{
    quote: PriceQuote;
    lines: typeof lines;
    coupon: string;
    points: number;
    version: number;
  } | null>(null);
  const quote =
    result &&
    result.lines === lines &&
    result.coupon === coupon &&
    result.points === points
    && result.version === version
      ? result.quote
      : null;
  useEffect(() => {
    let active = true;
    currentUser()
      .then((next) => {
        if (active) setUser(next);
      })
      .catch((error) => {
        if (active) setMessage(authError(error));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user || !ready || canCheckout === false || !lines.length || !Number.isInteger(points) || points < 0 || points > user.loyaltyPoints) return;
    let active = true;
    const timer = setTimeout(async () => {
      setCalculating(true); setQuoteError('');
      try {
        const next = await calculateQuote(lines, coupon, points);
        if (active) setResult({ quote: next, lines, coupon, points, version });
      } catch (caught) {
        if (active) { setResult(null); setQuoteError(caught instanceof Error ? caught.message : 'Không thể tính tổng đơn.'); }
      } finally { if (active) setCalculating(false); }
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [user, ready, canCheckout, lines, coupon, points, version, quoteAttempt]);
  if (checking)
    return (
      <CenteredDialog label="Kiểm tra đăng nhập" onClose={onClose}>
        <p className="purchase-panel" role="status">
          Đang kiểm tra đăng nhập…
        </p>
      </CenteredDialog>
    );
  if (!user && !message)
    return <LoginForm onClose={onClose} onSuccess={setUser} />;
  return (
    <CenteredDialog label="Xác nhận mua" onClose={onClose} className="purchase-dialog">
      <div className="purchase-panel">
        <button
          type="button"
          className="purchase-close"
          onClick={onClose}
          aria-label="Đóng"
        >
          ×
        </button>
        <h2>Xác nhận mua</h2>
        {user && (
          <>
            <p className="purchase-user">
              {user.fullName} · {user.email}
            </p>
            <label htmlFor="purchase-coupon">Mã giảm giá</label>
            <input
              id="purchase-coupon"
              value={coupon}
              onChange={(event) => setCoupon(event.target.value)}
            />
            <label htmlFor="purchase-points">
              Dùng điểm thưởng (hiện có {user.loyaltyPoints})
            </label>
            <input
              id="purchase-points"
              type="number"
              min={0}
              max={user.loyaltyPoints}
              step={1}
              value={points}
              onChange={(event) => setPoints(Number(event.target.value))}
            />
            <p className="purchase-subtotal"><span>Tạm tính</span><strong>{formatPrice(subtotal)}đ</strong></p>
            {!validPoints && <p role="alert">Điểm phải là số nguyên từ 0 đến số điểm hiện có.</p>}
            {(!quote || calculating) && !quoteError && validPoints && ready && canCheckout !== false && <p role="status">Đang cập nhật tổng đơn…</p>}
            {quoteError && <p role="alert">{quoteError} <button type="button" onClick={() => setQuoteAttempt((value) => value + 1)}>Thử lại</button></p>}
            {quote && (
              <div>
                <p>
                  Giảm giá:{" "}
                  {formatPrice(
                    quote.discountAmount,
                  )}
                  đ
                </p>
                <p>Giảm bằng điểm: {formatPrice(quote.pointsDiscount)}đ</p>
                <strong>
                  Tổng thanh toán: {formatPrice(quote.finalTotal)}đ
                </strong>
              </div>
            )}
            {!ready && <p role="status">Đang đồng bộ giỏ hàng PostgreSQL…</p>}
            {quote && (
              <button
                className="btn btn-espresso"
                disabled={pending || calculating || !ready || canCheckout === false}
                onClick={async () => {
                  setPending(true);
                  setMessage("");
                  try {
                    const order = await createCheckoutOrder(
                      user.id,
                      {
                        cartVersion: version,
                        couponCode: coupon,
                        pointsUsed: points,
                        quoteFingerprint: quote.quoteFingerprint,
                      },
                    );
                    await reload();
                    onClose();
                    router.push(`/orders/${order.id}`);
                  } catch (error) {
                    setMessage(authError(error));
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Đang tạo đơn…" : "Xác nhận mua"}
              </button>
            )}
          </>
        )}
        {message && <p role="alert">{message}</p>}
        {message && user && <button disabled={pending} onClick={async () => { setPending(true); try { await reload(); setResult(null); setMessage('Đã tải lại giỏ. Vui lòng tính lại tổng đơn.'); } catch (caught) { setMessage(authError(caught)); } finally { setPending(false); } }}>Đồng bộ lại giỏ</button>}
        {user && pendingCheckout(user.id) && <button disabled={pending} onClick={async () => {
          const previous = pendingCheckout(user.id); if (!previous) return;
          setPending(true);
          try { const order = await createCheckoutOrder(user.id, previous.body); await reload(); onClose(); router.push(`/orders/${order.id}`); }
          catch (caught) { setMessage(authError(caught)); } finally { setPending(false); }
        }}>Khôi phục kết quả tạo đơn trước</button>}
      </div>
    </CenteredDialog>
  );
}
