"use client";
import { useRef, useState } from "react";
import { sendStore } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { CenteredDialog } from "../ui/centered-dialog";

type Change = { id: string; path: string; field: string; previous: boolean; next: boolean; message: string; undo?: boolean };
type Confirmation = { title: string; description: string; action: string; change: Change };
export function useAdminToggle(onRefresh: () => void) {
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ text: string; error?: boolean; change?: Change } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const value = (id: string, original: boolean) => overrides[id] ?? original;
  async function apply(change: Change, undoing = false) {
    if (busy.current) return;
    busy.current = true; setPending(change.id); setConfirmation(null); setNotice(null);
    const next = undoing ? change.previous : change.next;
    const previous = undoing ? change.next : change.previous;
    setOverrides((old) => ({ ...old, [change.id]: next }));
    try {
      await sendStore(change.path, { [change.field]: next }, "patch");
      setNotice({ text: undoing ? "Đã hoàn tác." : change.message, change: !undoing && change.undo ? change : undefined });
      onRefresh();
    } catch (error) {
      setOverrides((old) => ({ ...old, [change.id]: previous }));
      setNotice({ text: authError(error), error: true });
    } finally { busy.current = false; setPending(null); }
  }
  function request(change: Change, prompt?: Omit<Confirmation, "change">) {
    if (busy.current) return;
    if (prompt) setConfirmation({ ...prompt, change });
    else void apply(change);
  }
  const feedback = <>
    {notice && <div className={`admin-action-toast${notice.error ? " is-error" : ""}`}>
      <span role={notice.error ? "alert" : "status"}>{notice.text}</span>
      {notice.change && <button type="button" disabled={pending !== null} onClick={() => void apply(notice.change!, true)}>Hoàn tác</button>}
      <button type="button" aria-label="Đóng thông báo" onClick={() => setNotice(null)}>×</button>
    </div>}
    {confirmation && <CenteredDialog label={confirmation.title} className="admin-confirm-dialog" onClose={() => setConfirmation(null)}>
      <h2>{confirmation.title}</h2><p>{confirmation.description}</p>
      <div className="store-actions"><button type="button" onClick={() => setConfirmation(null)}>Hủy</button><button type="button" onClick={() => void apply(confirmation.change)}>{confirmation.action}</button></div>
    </CenteredDialog>}
  </>;
  return { pending, value, request, feedback };
}
