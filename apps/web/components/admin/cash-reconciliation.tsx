"use client";

import { useState } from "react";
import { authError } from "../../services/auth.service";
import {
  reconcileAdminShift,
  type AdminCashShiftsResponse,
  type CashShift,
} from "../../services/pos.service";
import { formatPrice } from "../../lib/format-price";
import { CenteredDialog } from "../ui/centered-dialog";
import "./cash-reconciliation.css";

const money = (value: string | number | null | undefined) =>
  value == null ? "—" : `${formatPrice(value)}đ`;

const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
      })
    : "—";

const shiftStatusLabels: Record<CashShift["status"], string> = {
  OPEN: "Đang mở",
  CLOSED: "Chờ thu quỹ",
  RECONCILED: "Đã thu quỹ",
};

export function CashReconciliation({
  data,
  onRefresh,
}: {
  data: AdminCashShiftsResponse;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<"ALL" | CashShift["status"]>("ALL");
  const [selected, setSelected] = useState<CashShift | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = data.shifts.filter(
    (s) => filter === "ALL" || s.status === filter,
  );

  async function confirmReconcile(shift: CashShift) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await reconcileAdminShift(shift.id, note.trim());
      setSelected(updated);
      setNote("");
      setNotice(`Đã thu ${money(updated.countedCash)} từ ca ${updated.staff.fullName}.`);
      onRefresh();
    } catch (caught) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  }

  const { summary } = data;
  const varianceNum = Number(summary.totalVariance);
  const nonCashTotal =
    Number(summary.posNonCashRevenue) + Number(summary.appOnlineRevenue);

  return (
    <div className="cash-rec">
      <div className="cash-kpi-grid">
        <article className="cash-kpi-card cash-kpi-highlight">
          <small>Chờ thu quỹ</small>
          <strong>{money(summary.pendingCashToCollect)}</strong>
          <span>{summary.closedPendingCount} ca đã đóng</span>
        </article>
        <article className="cash-kpi-card">
          <small>Đã thu quỹ</small>
          <strong>{money(summary.reconciledCashTotal)}</strong>
          <span>
            {summary.reconciledCount} ca · Lệch {varianceNum > 0 ? "+" : ""}
            {money(summary.totalVariance)}
          </span>
        </article>
        <article className="cash-kpi-card">
          <small>Doanh thu tiền mặt</small>
          <strong>{money(summary.cashRevenue)}</strong>
          <span>{summary.cashOrders} đơn tại quầy</span>
        </article>
        <article className="cash-kpi-card">
          <small>Chuyển khoản / Online</small>
          <strong>{money(nonCashTotal)}</strong>
          <span>
            QR quầy {money(summary.posNonCashRevenue)} · Online{" "}
            {money(summary.appOnlineRevenue)}
          </span>
        </article>
      </div>

      {error && (
        <p className="cash-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="cash-notice" role="status">
          ✓ {notice}
        </p>
      )}

      <div className="cash-filters" role="group" aria-label="Lọc trạng thái ca">
        {(
          [
            ["ALL", `Tất cả (${data.shifts.length})`],
            ["CLOSED", `Chờ thu quỹ (${summary.closedPendingCount})`],
            ["OPEN", `Đang mở (${summary.openShiftsCount})`],
            ["RECONCILED", `Đã thu quỹ (${summary.reconciledCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className="cash-filter-btn"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <p className="cash-empty">Chưa có ca thu ngân.</p>
      ) : (
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Thời gian ca</th>
                <th>Quỹ đầu ca</th>
                <th>Thu / Hoàn</th>
                <th>Dự kiến</th>
                <th>Thực đếm</th>
                <th>Chênh lệch</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shift) => {
                const diff = shift.variance == null ? null : Number(shift.variance);
                return (
                  <tr key={shift.id}>
                    <td>
                      <strong>{shift.staff.fullName}</strong>
                      <br />
                      <small>{shift.staff.email}</small>
                    </td>
                    <td>
                      <small>{dateTime(shift.openedAt)}</small>
                      <br />
                      <small>{dateTime(shift.closedAt)}</small>
                    </td>
                    <td>{money(shift.openingFloat)}</td>
                    <td>
                      +{money(shift.cashCollected)} ({shift.cashPaymentCount})
                      <br />
                      <small>
                        -{money(shift.cashRefunded)} ({shift.cashRefundCount})
                      </small>
                    </td>
                    <td>{money(shift.expectedCash)}</td>
                    <td>{money(shift.countedCash)}</td>
                    <td>
                      {diff == null ? (
                        "—"
                      ) : (
                        <span
                          className={
                            diff === 0 ? "cash-variance-ok" : "cash-variance-diff"
                          }
                        >
                          {diff > 0 ? "+" : ""}
                          {money(diff)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`cash-status-pill cash-status-${shift.status.toLowerCase()}`}
                      >
                        {shiftStatusLabels[shift.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={
                          shift.status === "CLOSED"
                            ? "cash-action-primary"
                            : "cash-action-secondary"
                        }
                        onClick={() => {
                          setSelected(shift);
                          setNote("");
                          setError("");
                        }}
                      >
                        {shift.status === "CLOSED" ? "Thu quỹ" : "Xem"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <CenteredDialog
          label={`Ca thu ngân ${selected.staff.fullName}`}
          className="cash-detail-modal"
          onClose={() => !busy && setSelected(null)}
        >
          <div className="cash-detail-head">
            <h2>Ca thu ngân · {selected.staff.fullName}</h2>
            <button
              type="button"
              className="cash-detail-close"
              aria-label="Đóng"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <div className="cash-detail-body">
            <dl className="cash-detail-dl">
              <div><dt>Trạng thái</dt><dd>{shiftStatusLabels[selected.status]}</dd></div>
              <div><dt>Mở ca</dt><dd>{dateTime(selected.openedAt)}</dd></div>
              <div><dt>Đóng ca</dt><dd>{dateTime(selected.closedAt)}</dd></div>
              <div><dt>Quỹ đầu ca</dt><dd>{money(selected.openingFloat)}</dd></div>
              <div><dt>Thu tiền mặt ({selected.cashPaymentCount})</dt><dd>+{money(selected.cashCollected)}</dd></div>
              <div><dt>Hoàn tiền mặt ({selected.cashRefundCount})</dt><dd>-{money(selected.cashRefunded)}</dd></div>
              <div><dt>Dự kiến trong két</dt><dd>{money(selected.expectedCash)}</dd></div>
              <div><dt>Thực đếm</dt><dd>{money(selected.countedCash)}</dd></div>
              <div>
                <dt>Chênh lệch</dt>
                <dd>
                  {selected.variance == null
                    ? "—"
                    : `${Number(selected.variance) > 0 ? "+" : ""}${money(selected.variance)}`}
                </dd>
              </div>
              {selected.closingNote && (
                <div>
                  <dt>Ghi chú đóng ca</dt>
                  <dd>{selected.closingNote}</dd>
                </div>
              )}
              {selected.reconciledByAdmin && (
                <div>
                  <dt>Người thu quỹ</dt>
                  <dd>
                    {selected.reconciledByAdmin.fullName} · {dateTime(selected.reconciledAt)}
                  </dd>
                </div>
              )}
              {selected.reconcileNote && (
                <div>
                  <dt>Ghi chú thu quỹ</dt>
                  <dd>{selected.reconcileNote}</dd>
                </div>
              )}
            </dl>

            <section>
              <h3>Thu tiền mặt ({selected.payments.length})</h3>
              {!selected.payments.length ? (
                <p className="cash-sub-empty">Không có giao dịch.</p>
              ) : (
                <ul className="cash-sublist">
                  {selected.payments.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>
                          {p.orderCode} · {p.guestLabel || "Khách tại quầy"}
                        </strong>
                        <small>
                          {dateTime(p.createdAt)} · Đưa {money(p.cashTendered)} · Thối{" "}
                          {money(p.changeGiven)}
                        </small>
                      </div>
                      <strong>+{money(p.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3>Hoàn tiền mặt ({selected.refunds.length})</h3>
              {!selected.refunds.length ? (
                <p className="cash-sub-empty">Không có hoàn tiền.</p>
              ) : (
                <ul className="cash-sublist">
                  {selected.refunds.map((r) => (
                    <li key={r.id}>
                      <div>
                        <strong>
                          {r.orderCode} · {r.guestLabel || "Khách tại quầy"}
                        </strong>
                        <small>
                          {dateTime(r.createdAt)} · {r.reason || "—"}
                        </small>
                      </div>
                      <strong className="cash-variance-diff">-{money(r.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {selected.status === "CLOSED" && (
              <div className="cash-reconcile-box">
                <strong>Thu {money(selected.countedCash)} về quỹ</strong>
                <input
                  type="text"
                  maxLength={300}
                  aria-label="Ghi chú thu quỹ"
                  placeholder="Ghi chú (tùy chọn)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  type="button"
                  className="cash-reconcile-btn"
                  disabled={busy}
                  onClick={() => void confirmReconcile(selected)}
                >
                  {busy ? "Đang xác nhận…" : "Xác nhận thu quỹ"}
                </button>
              </div>
            )}
          </div>
        </CenteredDialog>
      )}
    </div>
  );
}
