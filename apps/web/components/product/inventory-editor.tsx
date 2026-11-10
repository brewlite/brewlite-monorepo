"use client";
import { useRef, useState } from "react";
import { sendStore } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { CenteredDialog } from "../ui/centered-dialog";

export type InventoryRow = { id: string; name: string; onHand: number | null; reserved: number; version: number };
type Undo = { previous: number; saved: InventoryRow };
export function InventoryEditor({ row, productName, onSaved, onPreview, selling = true }: {
  row: InventoryRow; productName: string; onSaved: () => void;
  onPreview?: (value: number | null) => void; selling?: boolean;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [risk, setRisk] = useState<{ next: number; expected: InventoryRow; undoing: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  const [committed, setCommitted] = useState<InventoryRow | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const current = committed && committed.version >= row.version ? committed : row;
  const number = Number(value);
  const inputError = value.trim() === "" ? "" : !Number.isInteger(number) || number < 0 || number > 2147483647
    ? "Nhập số nguyên từ 0 đến 2.147.483.647."
    : number < current.reserved ? `Không thấp hơn số đang giữ: ${current.reserved}` : "";
  const valid = value.trim() !== "" && !inputError;
  const sizeName = row.name.replace(/^size\s+/i, "");
  function cancel() { if (busy.current) return; setEditing(false); setRisk(null); setError(""); onPreview?.(null); }
  async function persist(next: number, expected: InventoryRow, undoing = false) {
    if (busy.current || needsRefresh) return;
    busy.current = true; setPending(true); setError(""); setRisk(null);
    try {
      const saved = await sendStore<InventoryRow>(`/admin/sizes/${row.id}/inventory`, { onHand: next, expectedVersion: expected.version }, "patch");
      setCommitted(saved); setEditing(false); onPreview?.(null);
      setUndo(!undoing && expected.onHand !== null && expected.onHand !== next ? { previous: expected.onHand, saved } : null);
      setNotice(undoing ? `Đã hoàn tác tồn ${productName} · Size ${sizeName}.` : `Đã cập nhật tồn ${productName} · Size ${sizeName}: ${expected.onHand ?? "Chưa nhập"} → ${next}${expected.onHand === null ? ". Tồn mới khởi tạo không thể hoàn tác về chưa nhập." : ""}`);
      onSaved();
    } catch (caught) {
      setError(authError(caught)); setNeedsRefresh(true); setUndo(null); setNotice(""); onPreview?.(null);
    } finally { busy.current = false; setPending(false); }
  }
  function requestSave(next: number, expected: InventoryRow, undoing = false) {
    if (pending || needsRefresh) return;
    if (selling && next - expected.reserved === 0 && (expected.onHand === null || expected.onHand - expected.reserved > 0)) setRisk({ next, expected, undoing });
    else void persist(next, expected, undoing);
  }
  function submit() {
    if (valid) requestSave(number, current);
  }
  return <>
    {!editing && <button type="button" className="inventory-stock-button" aria-label={`Chỉnh tồn ${productName}, size ${row.name}`} disabled={pending || needsRefresh} onClick={() => { setValue(current.onHand === null ? "" : String(current.onHand)); setEditing(true); setError(""); }}>
      {current.onHand === null ? "Nhập tồn" : <>{current.onHand}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg></>}
    </button>}
    {editing && <form className="inventory-inline-editor" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
      <div className="inventory-inline-controls"><input autoFocus type="number" aria-label={`Tồn thực tế ${row.name}`} aria-invalid={!!inputError} aria-describedby={inputError ? `stock-error-${row.id}` : undefined} min={current.reserved} max={2147483647} step="1" value={value} disabled={pending || needsRefresh} onChange={(event) => { const next = event.target.value; setValue(next); const n = Number(next); onPreview?.(next.trim() !== "" && Number.isInteger(n) && n >= current.reserved && n >= 0 && n <= 2147483647 ? n : null); }} />
        <button type="submit" aria-label="Lưu tồn" title="Lưu (Enter)" disabled={!valid || pending || needsRefresh}>✓</button>
        <button type="button" className="inventory-cancel" aria-label="Hủy sửa tồn" title="Hủy (Esc)" disabled={pending} onClick={cancel}>✕</button></div>
      {inputError && <p id={`stock-error-${row.id}`} role="alert">{inputError}</p>}
    </form>}
    {error && <p role="alert" className="inventory-save-error">{error}</p>}
    {needsRefresh && <button type="button" onClick={() => { setValue(""); setError(""); setNeedsRefresh(false); setCommitted(null); onSaved(); }}>Tải lại tồn kho</button>}
    {notice && <div className="admin-action-toast"><span role="status">{notice}</span>{undo && <button type="button" disabled={pending || needsRefresh} onClick={() => requestSave(undo.previous, undo.saved, true)}>Hoàn tác</button>}<button type="button" aria-label="Đóng thông báo" onClick={() => { setNotice(""); setUndo(null); }}>×</button></div>}
    {risk && <CenteredDialog label={risk.next === 0 ? "Đặt tồn về 0?" : "Đặt số có thể bán về 0?"} className="admin-confirm-dialog inventory-risk-dialog" onClose={() => { if (!pending) setRisk(null); }}>
      <h2>{risk.next === 0 ? "Đặt tồn về 0?" : "Đặt số có thể bán về 0?"}</h2><p>{productName} · Size {sizeName} đang bán sẽ chuyển sang <strong>Hết hàng</strong> và khách không đặt được size này nữa.</p>
      <div className="store-actions"><button type="button" className="inventory-cancel" onClick={() => setRisk(null)}>Hủy</button><button type="button" onClick={() => void persist(risk.next, risk.expected, risk.undoing)}>{risk.next === 0 ? "Đặt về 0" : "Xác nhận hết hàng"}</button></div>
    </CenteredDialog>}
  </>;
}
