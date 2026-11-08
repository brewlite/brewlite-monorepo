"use client";
import { useState } from "react";
import { sendStore } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { CenteredDialog } from "../ui/centered-dialog";

export type InventoryRow = { id: string; name: string; onHand: number | null; reserved: number; version: number };
export function InventoryEditor({ row, productName, onSaved }: { row: InventoryRow; productName: string; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const valid = value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= row.reserved && Number(value) >= 0 && Number(value) <= 2147483647;
  async function save() {
    if (!valid || pending || needsRefresh) return;
    setPending(true); setError("");
    try {
      await sendStore(`/admin/sizes/${row.id}/inventory`, { onHand: Number(value), expectedVersion: row.version }, "patch");
      setValue(""); setMessage("Lưu tồn kho thành công."); setConfirm(false); onSaved();
    } catch (caught) {
      setError(authError(caught)); setNeedsRefresh(true); setConfirm(false);
    } finally { setPending(false); }
  }
  return <>
    <form className="inventory-editor" onSubmit={(event) => { event.preventDefault(); setMessage(""); if (!valid) { setError("Tồn phải là số nguyên không âm, không nhỏ hơn Reserved và không vượt 2.147.483.647."); return; } setConfirm(true); }}>
      <label>Đặt tồn thực tế<input type="number" aria-label={`Tồn thực tế ${row.name}`} min={row.reserved} max={2147483647} step="1" required value={value} disabled={pending || needsRefresh} onChange={(event) => setValue(event.target.value)} /></label>
      <button disabled={pending || needsRefresh}>Lưu tồn</button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {needsRefresh && <button type="button" onClick={() => { setValue(""); setError(""); setNeedsRefresh(false); onSaved(); }}>Refresh tồn kho</button>}
    </form>
    {confirm && <CenteredDialog label="Xác nhận cập nhật tồn kho" onClose={() => { if (!pending) setConfirm(false); }}>
      <h2>Xác nhận cập nhật tồn kho</h2>
      <p>{productName} · {row.name}</p>
      <p>On hand: {row.onHand === null ? "Chưa nhập tồn kho" : row.onHand} → {Number(value)}</p>
      <p>Reserved: {row.reserved} · Available sau lưu: {Number(value) - row.reserved}</p>
      <button type="button" disabled={pending} onClick={() => void save()}>Xác nhận lưu</button>
      <button type="button" disabled={pending} onClick={() => setConfirm(false)}>Hủy</button>
    </CenteredDialog>}
  </>;
}
