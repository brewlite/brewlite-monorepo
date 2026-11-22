"use client";
import { useEffect, useState } from "react";
import { getStore } from "../../services/store.service";
import { useAuthUser } from "../../lib/auth-store";
import { CenteredDialog } from "../ui/centered-dialog";
import { CatalogManagement } from "./catalog-management";
type Profile = Record<string, unknown> & { id: string; role: string };
export function AdminLinkedAccountDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const actor = useAuthUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (actor?.role !== "ADMIN") return;
    getStore<Profile>(`/admin/users/${encodeURIComponent(userId)}/detail`).then((value) => {
      if (!value || value.id !== userId || !["CUSTOMER", "STAFF", "ADMIN"].includes(value.role)) throw new Error("Invalid account response");
      if (active) setProfile(value);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [actor?.role, userId, attempt]);
  if (actor?.role === "ADMIN" && profile) return <CatalogManagement key={profile.id} kind="users" rows={[profile]} products={[]} detailAccount={profile} detailsOnly onDetailClose={onClose} onEdit={() => {}} onRefresh={() => {}} />;
  return <CenteredDialog label="Chi tiết tài khoản" className="admin-user-details-dialog account-profile-dialog" onClose={onClose}><header className="account-profile-head"><h2>Chi tiết tài khoản</h2><button type="button" className="account-profile-close" aria-label="Đóng chi tiết tài khoản" onClick={onClose}>×</button></header><div className="account-profile-body">
    {actor?.role !== "ADMIN" ? <p role="alert">Chỉ quản trị viên được xem thông tin tài khoản này.</p> : error ? <p role="alert">Không thể tải chi tiết tài khoản. <button type="button" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Thử lại</button></p> : <p role="status">Đang tải chi tiết tài khoản…</p>}
  </div></CenteredDialog>;
}
