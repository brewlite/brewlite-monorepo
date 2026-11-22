"use client";
import { useEffect, useState } from "react";
import { getStore } from "../../services/store.service";
import { CatalogManagement } from "./catalog-management";

type Row = Record<string, unknown> & { id: string };
type Accounts = { items: Row[]; total: number; totalPages: number };

export function AccountManagement({ onEdit, refreshVersion = 0 }: { onEdit: (row: Row | null) => void; refreshVersion?: number }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Accounts>({ items: [], total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ page: String(page), pageSize: "25", query, role });
      getStore<Accounts>(`/admin/users/search?${params}`).then((value) => {
        if (!active) return;
        if (page > Math.max(1, value.totalPages)) {
          setLoading(true);
          setPage(Math.max(1, value.totalPages));
          return;
        }
        setResult(value);
        setLoading(false);
      }).catch(() => { if (active) { setError(true); setLoading(false); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, role, page, attempt, refreshVersion]);
  function reload() { setLoading(true); setError(false); setAttempt((value) => value + 1); }
  return <CatalogManagement kind="users" rows={loading || error ? [] : result.items} products={[]} onEdit={onEdit} onRefresh={reload}
    accountSearch={{ query, role, page, total: result.total, totalPages: result.totalPages, loading, error,
      onQuery: (value) => { setQuery(value); setPage(1); setLoading(true); setError(false); },
      onRole: (value) => { setRole(value); setPage(1); setLoading(true); setError(false); },
      onPage: (value) => { setPage(value); setLoading(true); setError(false); }, onRetry: reload }} />;
}
