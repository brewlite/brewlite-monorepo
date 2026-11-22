"use client";

import { useEffect, useMemo, useState } from "react";
import { authError } from "../../services/auth.service";
import type { Order } from "../../services/store.service";
import {
  cancelCounterOrder,
  closeCashShift,
  getCurrentShift,
  openCashShift,
  type CashShift,
  type StaffShiftResponse,
} from "../../services/pos.service";
import { formatPrice } from "../../lib/format-price";
import { generateQrMatrix } from "../../lib/qr-svg";
import { CenteredDialog } from "../ui/centered-dialog";
import "./staff-cash-controls.css";

const money = (value: string | number | null | undefined) =>
  value == null ? "—" : `${formatPrice(value)}đ`;

const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function QrCodeSvg({ payload }: { payload: string }) {
  const matrix = useMemo(() => generateQrMatrix(payload), [payload]);
  const quiet = 4;
  const viewSize = matrix.length + quiet * 2;
  return (
    <svg
      className="sc-qr-svg"
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      role="img"
      aria-label={`Mã QR thanh toán ${payload}`}
      shapeRendering="crispEdges"
    >
      <rect width={viewSize} height={viewSize} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((dark, c) =>
          dark ? (
            <rect
              key={`${r}-${c}`}
              x={c + quiet}
              y={r + quiet}
              width={1}
              height={1}
              fill="#111111"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function StaffShiftControl() {
  const [shiftData, setShiftData] = useState<StaffShiftResponse | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("500000");
  const [closeModal, setCloseModal] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [closedSummary, setClosedSummary] = useState<CashShift | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentShift()
      .then((res) => {
        if (active) setShiftData(res);
      })
      .catch(() => {
        /* ignore initial shift load errors outside auth */
      });
    return () => {
      active = false;
    };
  }, [tick]);

  const activeShift = shiftData?.current ?? null;

  async function submitOpen() {
    const amount = Number(openingFloat);
    if (!Number.isInteger(amount) || amount < 0) {
      setError("Quỹ đầu ca phải là số nguyên không âm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await openCashShift(amount);
      setOpenModal(false);
      setTick((v) => v + 1);
    } catch (caught) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitClose() {
    const counted = Number(countedCash);
    if (!Number.isInteger(counted) || counted < 0) {
      setError("Tiền thực đếm phải là số nguyên không âm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const closed = await closeCashShift(counted, closingNote.trim());
      setCloseModal(false);
      setCountedCash("");
      setClosingNote("");
      setClosedSummary(closed);
      setTick((v) => v + 1);
    } catch (caught) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!shiftData) return null;

  return (
    <>
      {activeShift ? (
        <div className="sc-shift-pill sc-shift-open">
          <span className="sc-dot sc-dot-open" aria-hidden="true" />
          <span>
            Đang mở ca · {timeLabel(activeShift.openedAt)} · Quỹ{" "}
            <strong>{money(activeShift.openingFloat)}</strong>
          </span>
          <button
            type="button"
            className="sc-btn sc-btn-secondary sc-btn-compact"
            disabled={busy}
            onClick={() => {
              setError("");
              setCountedCash("");
              setClosingNote("");
              setCloseModal(true);
            }}
          >
            Đóng ca
          </button>
        </div>
      ) : (
        <div className="sc-shift-pill sc-shift-closed">
          <span className="sc-dot sc-dot-closed" aria-hidden="true" />
          <span>Chưa mở ca</span>
          <button
            type="button"
            className="sc-btn sc-btn-compact"
            disabled={busy}
            onClick={() => {
              setError("");
              setOpeningFloat("500000");
              setOpenModal(true);
            }}
          >
            Mở ca
          </button>
        </div>
      )}

      {openModal && (
        <CenteredDialog
          label="Mở ca"
          className="sc-modal"
          onClose={() => !busy && setOpenModal(false)}
        >
          <div className="sc-modal-head">
            <h2>Mở ca</h2>
            <button
              type="button"
              className="sc-modal-close"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setOpenModal(false)}
            >
              ×
            </button>
          </div>
          <div className="sc-modal-body">
            <div className="sc-field">
              <label htmlFor="sc-open-float">Quỹ đầu ca (VND)</label>
              <input
                id="sc-open-float"
                type="number"
                min={0}
                step={1000}
                className="sc-input sc-input-amount"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
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
            {error && (
              <p className="sc-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="sc-btn sc-btn-lg"
              disabled={busy}
              onClick={() => void submitOpen()}
            >
              {busy ? "Đang mở…" : "Mở ca"}
            </button>
          </div>
        </CenteredDialog>
      )}

      {closeModal && activeShift && (
        <CenteredDialog
          label="Đóng ca"
          className="sc-modal"
          onClose={() => !busy && setCloseModal(false)}
        >
          <div className="sc-modal-head">
            <h2>Đóng ca</h2>
            <button
              type="button"
              className="sc-modal-close"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setCloseModal(false)}
            >
              ×
            </button>
          </div>
          <div className="sc-modal-body">
            <div className="sc-field">
              <label htmlFor="sc-counted-cash">Tiền mặt thực đếm (VND)</label>
              <input
                id="sc-counted-cash"
                type="number"
                min={0}
                step={1000}
                className="sc-input sc-input-amount"
                placeholder="0"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
              />
            </div>
            <div className="sc-field">
              <label htmlFor="sc-closing-note">Ghi chú</label>
              <input
                id="sc-closing-note"
                className="sc-input"
                maxLength={300}
                placeholder="Bắt buộc nếu chênh lệch"
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
              />
            </div>
            {error && (
              <p className="sc-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="sc-btn sc-btn-lg"
              disabled={busy || countedCash.trim() === ""}
              onClick={() => void submitClose()}
            >
              {busy ? "Đang đóng…" : "Đóng ca"}
            </button>
          </div>
        </CenteredDialog>
      )}

      {closedSummary && (
        <CenteredDialog
          label="Kết quả đóng ca"
          className="sc-modal"
          onClose={() => setClosedSummary(null)}
        >
          <div className="sc-modal-head">
            <h2>Kết quả đóng ca</h2>
            <button
              type="button"
              className="sc-modal-close"
              aria-label="Đóng"
              onClick={() => setClosedSummary(null)}
            >
              ×
            </button>
          </div>
          <div className="sc-modal-body">
            <dl className="sc-dl">
              <div><dt>Quỹ đầu ca</dt><dd>{money(closedSummary.openingFloat)}</dd></div>
              <div><dt>Thu tiền mặt ({closedSummary.cashPaymentCount})</dt><dd>+{money(closedSummary.cashCollected)}</dd></div>
              <div><dt>Hoàn tiền mặt ({closedSummary.cashRefundCount})</dt><dd>-{money(closedSummary.cashRefunded)}</dd></div>
              <div><dt>Dự kiến trong két</dt><dd>{money(closedSummary.expectedCash)}</dd></div>
              <div><dt>Thực đếm</dt><dd>{money(closedSummary.countedCash)}</dd></div>
              <div>
                <dt>Chênh lệch</dt>
                <dd className={Number(closedSummary.variance ?? 0) === 0 ? "sc-ok" : "sc-diff"}>
                  {Number(closedSummary.variance ?? 0) > 0 ? "+" : ""}
                  {money(closedSummary.variance)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className="sc-btn sc-btn-lg"
              onClick={() => setClosedSummary(null)}
            >
              Đóng
            </button>
          </div>
        </CenteredDialog>
      )}
    </>
  );
}

export function CounterRefundDialog({
  order,
  onClose,
  onRefunded,
}: {
  order: Order;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitRefund() {
    if (reason.trim().length < 3) {
      setError("Nhập lý do tối thiểu 3 ký tự.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await cancelCounterOrder(order.id, {
        expectedVersion: order.version,
        reason: reason.trim(),
      });
      onRefunded();
      onClose();
    } catch (caught) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredDialog
      label={`Hoàn tiền ${order.orderCode}`}
      className="sc-modal"
      onClose={() => !busy && onClose()}
    >
      <div className="sc-modal-head">
        <h2>Hoàn tiền</h2>
        <button
          type="button"
          className="sc-modal-close"
          aria-label="Đóng"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="sc-modal-body">
        <div className="sc-total-box">
          <span>{order.guestLabel || order.orderCode}</span>
          <strong>{money(order.finalTotal)}</strong>
        </div>
        <div className="sc-field">
          <label htmlFor="sc-refund-reason">Lý do hoàn tiền</label>
          <input
            id="sc-refund-reason"
            className="sc-input"
            maxLength={200}
            placeholder="Khách đổi món / Nhập nhầm..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <div className="sc-actions-2">
          <button
            type="button"
            className="sc-btn sc-btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Quay lại
          </button>
          <button
            type="button"
            className="sc-btn sc-btn-danger"
            disabled={busy}
            onClick={() => void submitRefund()}
          >
            {busy ? "Đang xử lý…" : "Hoàn tiền"}
          </button>
        </div>
      </div>
    </CenteredDialog>
  );
}
