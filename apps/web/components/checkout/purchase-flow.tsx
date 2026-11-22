"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createCheckoutOrder, pendingCheckout } from "../../services/checkout.service";
import {
  cancelCounterOrder,
  createCounterOrder,
  getCurrentShift,
  openCashShift,
  payCounterOrder,
  type StaffShiftResponse,
} from "../../services/pos.service";
import type { Order } from "../../services/store.service";
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
import { QrCodeSvg } from "../staff/staff-cash-controls";

const money = (value: string | number) => `${formatPrice(value)}đ`;

export function PurchaseFlow({ onClose }: { onClose: () => void }) {
  const { lines, subtotal, version, ready, reload, canCheckout, clear } = useCart();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [coupon, setCoupon] = useState("");
  const [points, setPoints] = useState(0);
  const [guestLabel, setGuestLabel] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [payTab, setPayTab] = useState<"CASH" | "QR">("QR");
  const [cashTendered, setCashTendered] = useState(() => String(subtotal));
  const [shiftData, setShiftData] = useState<StaffShiftResponse | null>(null);
  const [openingFloat, setOpeningFloat] = useState("500000");
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteError, setQuoteError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [pending, setPending] = useState(false);
  const isStaff = user?.role === "STAFF";
  const validPoints =
    !!user &&
    !isStaff &&
    Number.isInteger(points) &&
    points >= 0 &&
    points <= user.loyaltyPoints;
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
    result.points === points &&
    result.version === version
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
    if (!isStaff) return;
    let active = true;
    getCurrentShift()
      .then((shift) => {
        if (!active) return;
        setShiftData(shift);
        setPayTab(shift.current ? "CASH" : "QR");
      })
      .catch(() => {
        if (active) setShiftData({ current: null, history: [] });
      });
    return () => {
      active = false;
    };
  }, [isStaff]);

  useEffect(() => {
    if (
      !user ||
      isStaff ||
      !ready ||
      canCheckout === false ||
      !lines.length ||
      !Number.isInteger(points) ||
      points < 0 ||
      points > user.loyaltyPoints
    )
      return;
    let active = true;
    const timer = setTimeout(async () => {
      setCalculating(true);
      setQuoteError("");
      try {
        const next = await calculateQuote(lines, coupon, points);
        if (active) setResult({ quote: next, lines, coupon, points, version });
      } catch (caught) {
        if (active) {
          setResult(null);
          setQuoteError(
            caught instanceof Error ? caught.message : "Không thể tính tổng đơn.",
          );
        }
      } finally {
        if (active) setCalculating(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [user, isStaff, ready, canCheckout, lines, coupon, points, version, quoteAttempt]);

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

  if (user && isStaff) {
    const activeShift = shiftData?.current ?? null;
    const totalDue = createdOrder ? Number(createdOrder.finalTotal) : subtotal;
    const tenderedNum = Number(cashTendered);
    const changeDue =
      Number.isFinite(tenderedNum) && tenderedNum >= totalDue
        ? tenderedNum - totalDue
        : null;
    const totalCount = lines.reduce((sum, l) => sum + l.quantity, 0);

    async function handleCreateQrOrder() {
      if (pending || createdOrder) return;
      if (!lines.length || !lines.every((l) => !!l.sizeId)) {
        setMessage("Có món chưa chọn Size. Vui lòng chọn lại.");
        return;
      }
      setPending(true);
      setMessage("");
      try {
        const order = await createCounterOrder({
          items: lines.map((line) => ({
            productId: line.productId,
            sizeId: line.sizeId!,
            toppingIds: line.toppings.map((t) => t.id),
            quantity: line.quantity,
            note: line.note,
          })),
          guestLabel: guestLabel.trim() || "Khách tại quầy",
          note: orderNote.trim(),
        });
        setCreatedOrder(order);
        setCashTendered(order.finalTotal);
      } catch (caught) {
        setMessage(authError(caught));
      } finally {
        setPending(false);
      }
    }

    async function handleCancelPendingOrder() {
      if (!createdOrder || pending) return;
      setPending(true);
      setMessage("");
      try {
        await cancelCounterOrder(createdOrder.id, {
          expectedVersion: createdOrder.version,
        });
        setCreatedOrder(null);
      } catch (caught) {
        setMessage(authError(caught));
      } finally {
        setPending(false);
      }
    }

    async function handleOpenShiftInline() {
      const amount = Number(openingFloat);
      if (!Number.isInteger(amount) || amount < 0) {
        setMessage("Quỹ đầu ca phải là số nguyên không âm.");
        return;
      }
      setPending(true);
      setMessage("");
      try {
        const opened = await openCashShift(amount);
        setShiftData((prev) => ({
          current: opened,
          history: prev?.history ?? [],
        }));
        setCashTendered(String(totalDue));
      } catch (caught) {
        setMessage(authError(caught));
      } finally {
        setPending(false);
      }
    }

    async function handleStaffComplete(method: "CASH" | "WALLET") {
      if (pending) return;
      if (!createdOrder) {
        if (!lines.length || !lines.every((l) => !!l.sizeId)) {
          setMessage("Có món chưa chọn Size. Vui lòng chọn lại.");
          return;
        }
      }
      if (
        method === "CASH" &&
        (!Number.isInteger(tenderedNum) || tenderedNum < totalDue)
      ) {
        setMessage("Tiền khách đưa phải lớn hơn hoặc bằng tổng đơn.");
        return;
      }

      setPending(true);
      setMessage("");
      try {
        let order = createdOrder;
        if (!order) {
          order = await createCounterOrder({
            items: lines.map((line) => ({
              productId: line.productId,
              sizeId: line.sizeId!,
              toppingIds: line.toppings.map((t) => t.id),
              quantity: line.quantity,
              note: line.note,
            })),
            guestLabel: guestLabel.trim() || "Khách tại quầy",
            note: orderNote.trim(),
          });
          setCreatedOrder(order);
        }

        await payCounterOrder(order.id, {
          method,
          ...(method === "CASH" ? { cashTendered: tenderedNum } : {}),
        });
        clear();
        onClose();
        router.push("/staff/orders");
      } catch (caught) {
        setMessage(authError(caught));
      } finally {
        setPending(false);
      }
    }

    return (
      <CenteredDialog
        label="Thanh toán tại quầy"
        onClose={() => !pending && onClose()}
        className="sc-modal"
      >
        <div className="sc-modal-head">
          <h2>Thanh toán tại quầy</h2>
          <button
            type="button"
            className="sc-modal-close"
            disabled={pending}
            onClick={onClose}
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="sc-modal-body">
          <div className="sc-field-row">
            <div className="sc-field">
              <label htmlFor="pos-flow-guest">Tên khách / Số thẻ</label>
              <input
                id="pos-flow-guest"
                className="sc-input"
                maxLength={60}
                disabled={!!createdOrder || pending}
                placeholder="Anh Minh / Thẻ #12"
                value={guestLabel}
                onChange={(event) => setGuestLabel(event.target.value)}
              />
            </div>
            <div className="sc-field">
              <label htmlFor="pos-flow-note">Ghi chú</label>
              <input
                id="pos-flow-note"
                className="sc-input"
                maxLength={200}
                disabled={!!createdOrder || pending}
                placeholder="Mang đi, ít đá..."
                value={orderNote}
                onChange={(event) => setOrderNote(event.target.value)}
              />
            </div>
          </div>

          <div className="sc-total-box">
            <span>
              {createdOrder ? createdOrder.orderCode : `Tổng cộng (${totalCount} ly)`}
            </span>
            <strong>{money(totalDue)}</strong>
          </div>

          <div className="sc-pay-switch" role="tablist" aria-label="Phương thức thanh toán">
            <button
              type="button"
              role="tab"
              aria-selected={payTab === "CASH"}
              className="sc-pay-tab"
              onClick={() => {
                setPayTab("CASH");
                setCashTendered(String(totalDue));
                setMessage("");
              }}
            >
              Tiền mặt
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={payTab === "QR"}
              className="sc-pay-tab"
              onClick={() => {
                setPayTab("QR");
                setMessage("");
              }}
            >
              Chuyển khoản QR
            </button>
          </div>

          {payTab === "CASH" ? (
            shiftData === null ? (
              <p role="status">Đang kiểm tra ca…</p>
            ) : !activeShift ? (
              <div className="sc-shift-inline">
                <p>Chưa mở ca thu ngân</p>
                <div className="sc-field">
                  <label htmlFor="pos-inline-float">Quỹ đầu ca (VND)</label>
                  <input
                    id="pos-inline-float"
                    type="number"
                    min={0}
                    step={1000}
                    className="sc-input sc-input-amount"
                    value={openingFloat}
                    onChange={(event) => setOpeningFloat(event.target.value)}
                  />
                </div>
                <div className="sc-chip-row">
                  {[0, 200000, 500000, 1000000].map((v) => (
                    <button
                      type="button"
                      key={v}
                      className="sc-chip"
                      onClick={() => setOpeningFloat(String(v))}
                    >
                      {money(v)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sc-btn sc-btn-lg"
                  disabled={pending}
                  onClick={() => void handleOpenShiftInline()}
                >
                  {pending ? "Đang mở ca…" : "Mở ca"}
                </button>
              </div>
            ) : (
              <>
                <div className="sc-field">
                  <label htmlFor="pos-flow-cash">Tiền khách đưa (VND)</label>
                  <input
                    id="pos-flow-cash"
                    type="number"
                    min={totalDue}
                    step={1000}
                    className="sc-input sc-input-amount"
                    value={cashTendered}
                    onChange={(event) => setCashTendered(event.target.value)}
                  />
                </div>
                <div className="sc-chip-row">
                  {[totalDue, 50000, 100000, 200000, 500000]
                    .filter((v, idx, arr) => v >= totalDue && arr.indexOf(v) === idx)
                    .map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        className="sc-chip"
                        onClick={() => setCashTendered(String(amount))}
                      >
                        {amount === totalDue ? "Đúng tiền" : money(amount)}
                      </button>
                    ))}
                </div>
                {changeDue !== null && (
                  <div className="sc-change-box">
                    <span>Tiền thối</span>
                    <strong>{money(changeDue)}</strong>
                  </div>
                )}
                {message && (
                  <p className="sc-error" role="alert">
                    {message}
                  </p>
                )}
                <button
                  type="button"
                  className="sc-btn sc-btn-lg"
                  disabled={
                    pending ||
                    changeDue === null ||
                    (!createdOrder && (!lines.length || canCheckout === false))
                  }
                  onClick={() => void handleStaffComplete("CASH")}
                >
                  {pending ? "Đang xử lý…" : "Thu tiền mặt"}
                </button>
              </>
            )
          ) : !createdOrder ? (
            <>
              {message && (
                <p className="sc-error" role="alert">
                  {message}
                </p>
              )}
              <button
                type="button"
                className="sc-btn sc-btn-lg"
                disabled={pending || !lines.length || canCheckout === false}
                onClick={() => void handleCreateQrOrder()}
              >
                {pending ? "Đang tạo mã QR…" : "Tạo mã QR"}
              </button>
            </>
          ) : (
            <>
              <div className="sc-qr-card">
                <QrCodeSvg
                  payload={`BREWLITE|${createdOrder.orderCode}|${createdOrder.finalTotal}`}
                />
                <strong>{money(createdOrder.finalTotal)}</strong>
                <span>{createdOrder.orderCode}</span>
              </div>
              {message && (
                <p className="sc-error" role="alert">
                  {message}
                </p>
              )}
              <button
                type="button"
                className="sc-btn sc-btn-lg"
                disabled={pending}
                onClick={() => void handleStaffComplete("WALLET")}
              >
                {pending ? "Đang xác nhận…" : "Xác nhận đã nhận QR"}
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-secondary"
                disabled={pending}
                onClick={() => void handleCancelPendingOrder()}
              >
                Hủy đơn
              </button>
            </>
          )}
        </div>
      </CenteredDialog>
    );
  }

  return (
    <CenteredDialog
      label="Xác nhận mua"
      onClose={onClose}
      className="purchase-dialog"
    >
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
            <p className="purchase-subtotal">
              <span>Tạm tính</span>
              <strong>{formatPrice(subtotal)}đ</strong>
            </p>
            {!validPoints && (
              <p role="alert">
                Điểm phải là số nguyên từ 0 đến số điểm hiện có.
              </p>
            )}
            {(!quote || calculating) &&
              !quoteError &&
              validPoints &&
              ready &&
              canCheckout !== false && (
                <p role="status">Đang cập nhật tổng đơn…</p>
              )}
            {quoteError && (
              <p role="alert">
                {quoteError}{" "}
                <button
                  type="button"
                  onClick={() => setQuoteAttempt((value) => value + 1)}
                >
                  Thử lại
                </button>
              </p>
            )}
            {quote && (
              <div>
                <p>Giảm giá: {formatPrice(quote.discountAmount)}đ</p>
                <p>Giảm bằng điểm: {formatPrice(quote.pointsDiscount)}đ</p>
                <strong>Tổng thanh toán: {formatPrice(quote.finalTotal)}đ</strong>
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
                    const order = await createCheckoutOrder(user.id, {
                      cartVersion: version,
                      couponCode: coupon,
                      pointsUsed: points,
                      quoteFingerprint: quote.quoteFingerprint,
                    });
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
        {message && user && (
          <button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await reload();
                setResult(null);
                setMessage("Đã tải lại giỏ. Vui lòng tính lại tổng đơn.");
              } catch (caught) {
                setMessage(authError(caught));
              } finally {
                setPending(false);
              }
            }}
          >
            Đồng bộ lại giỏ
          </button>
        )}
        {user && pendingCheckout(user.id) && (
          <button
            disabled={pending}
            onClick={async () => {
              const previous = pendingCheckout(user.id);
              if (!previous) return;
              setPending(true);
              try {
                const order = await createCheckoutOrder(user.id, previous.body);
                await reload();
                onClose();
                router.push(`/orders/${order.id}`);
              } catch (caught) {
                setMessage(authError(caught));
              } finally {
                setPending(false);
              }
            }}
          >
            Khôi phục kết quả tạo đơn trước
          </button>
        )}
      </div>
    </CenteredDialog>
  );
}
