"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { formatPrice } from "../../lib/format-price";
import { normalizeSearch } from "../../lib/normalize-search";
import { useAuthUser } from "../../lib/auth-store";
import { getStore } from "../../services/store.service";
import { CenteredDialog } from "../ui/centered-dialog";
import { useAdminToggle } from "./use-admin-toggle";
import { Pencil } from "./inventory-table";
import { AccountOrderList, accountDateTime } from "./account-order-list";
import "./account-profile.css";
import { AdminStaffActivity } from "./admin-staff-activity";
import { AdminOrderDetailContent } from "./order-detail-dialog";

const LinkedAccountDialog = lazy(() => import("./admin-linked-account-dialog").then((module) => ({ default: module.AdminLinkedAccountDialog })));

type Row = Record<string, unknown> & { id: string };
export type AccountSearch = {
  query: string; role: string; total: number; page: number; totalPages: number;
  loading: boolean; error: boolean; onQuery: (value: string) => void;
  onRole: (value: string) => void; onPage: (value: number) => void; onRetry: () => void;
};
type Kind = "categories" | "toppings" | "users";
type OrderStats = {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
};
type RecentOrder = {
  id: string;
  orderCode: string;
  status: string;
  finalTotal: string;
  createdAt: string;
};
type RecentOrderResponse = {
  items: RecentOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
type OrderFilter = "" | "COMPLETED" | "CANCELLED";
type DetailView = "account" | "orders" | "order";
const titles = { categories: "Danh mục", toppings: "Topping", users: "Tài khoản" };
const roles: Record<string, string> = { CUSTOMER: "Khách hàng", STAFF: "Nhân viên", ADMIN: "Quản trị viên" };

function CategoryIcon({ name }: { name: string }) {
  const category = normalizeSearch(name);
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {category.includes("ca phe") ? <><path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a3 3 0 1 1 0 6h-2M3 22h16M7 3v3m5-4v4" /></>
      : category.includes("tra sua") ? <><path d="M6 8h12l-2 14H8zM5 8h14M12 8l3-6h4" /><circle cx="10" cy="17" r=".8" fill="currentColor" /><circle cx="14" cy="18" r=".8" fill="currentColor" /><circle cx="12" cy="14" r=".8" fill="currentColor" /></>
      : category.includes("trai cay") ? <><circle cx="10" cy="14" r="8" /><path d="M10 6v16M2 14h16M4 8l12 12M4 20 16 8M13 5c0-3 4-4 7-3-1 4-4 5-7 3Z" /></>
      : category.includes("matcha") || category.includes("da xay") ? <><path d="M6 10h12l-2 12H8zM5 10h14M7 10C4 7 8 5 10 6c-1-3 4-5 5-2 4-1 6 4 2 6M14 4l3-3" /><path d="m10 14 3-1 2 3-3 2z" /></>
      : <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
  </svg>;
}

function ToppingIcon({ name }: { name: string }) {
  const normalized = normalizeSearch(name);
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {normalized.includes("tran chau") ? <>{[[7, 8], [16, 7], [12, 15], [5, 17], [19, 17]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.7" fill={normalized.includes("den") ? "currentColor" : "none"} />)}</>
      : normalized.includes("pudding") ? <><path d="m7 7-3 12c4 2 12 2 16 0L17 7z" /><ellipse cx="12" cy="7" rx="5" ry="2" /><path d="M7 16c3 1 7 1 10 0" /></>
      : normalized.includes("kem") || normalized.includes("cheese") ? <><path d="M5 15h14l-2 6H7zM6 15c-3-4 2-5 3-7-1 3 6 2 4-5 6 4 8 8 4 12M8 11c2 1 6 1 8 0" /></>
      : normalized.includes("thach") || normalized.includes("nha dam") ? <><path d="m3 9 6-3 5 3-6 3zM3 9v7l5 3 6-3V9M8 12v7m6-13 4-2 4 3-4 2zM18 9v5m4-7v7l-4 2" /></>
      : <><path d="M3 12h18c-1 6-4 8-9 8s-8-2-9-8ZM7 7v1m5-4v4m5-1v1" /></>}
  </svg>;
}

function validStats(value: unknown): value is OrderStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return ["totalOrders", "completedOrders", "cancelledOrders"].every((key) =>
    Number.isInteger(stats[key]) && (stats[key] as number) >= 0
  );
}

function verificationLabel(value: unknown) {
  if (value === null) return "Chưa xác minh";
  if (typeof value === "string" && value && !Number.isNaN(Date.parse(value)))
    return "Đã xác minh";
  return "Chưa có dữ liệu";
}

export function CatalogManagement({ kind, rows, products, onEdit, onRefresh, detailAccount, detailsOnly = false, onDetailClose, accountSearch }: {
  accountSearch?: AccountSearch;
  detailAccount?: Row; detailsOnly?: boolean; onDetailClose?: () => void;
  kind: Kind; rows: Row[]; products: Row[]; onEdit: (row: Row | null) => void; onRefresh: () => void;
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [localRole, setLocalRole] = useState("");
  const query = accountSearch?.query ?? localQuery;
  const role = accountSearch?.role ?? localRole;
  const setQuery = accountSearch?.onQuery ?? setLocalQuery;
  const setRole = accountSearch?.onRole ?? setLocalRole;
  const [detailId, setDetailId] = useState<string | null>(detailAccount?.id ?? null);
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(null);
  const [orderReturnView, setOrderReturnView] = useState<"account" | "orders">("account");
  const [previewOrders, setPreviewOrders] = useState<RecentOrder[] | null>(null);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [statsAttempt, setStatsAttempt] = useState(0);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersTotalPages, setOrdersTotalPages] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("");
  const [detailView, setDetailView] = useState<DetailView>("account");
  const [ordersAttempt, setOrdersAttempt] = useState(0);
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const ordersRequest = useRef(0);
  const profileCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (detailId && detailView !== "order") profileCloseRef.current?.focus(); }, [detailId, detailView]);
  const actor = useAuthUser();
  const action = useAdminToggle(onRefresh);
  const pending = action.pending;
  const flag = kind === "toppings" ? "isAvailable" : "isActive";
  const filtered = accountSearch ? rows : rows.filter((row) => normalizeSearch([row.name, row.fullName, row.email].filter(Boolean).join(" ")).includes(normalizeSearch(query)) && (!role || row.role === role));
  const counts = new Map<string, number>();
  products.forEach((product) => { const id = String(product.categoryId ?? ""); counts.set(id, (counts.get(id) ?? 0) + 1); });
  const largest = Math.max(1, ...counts.values());
  const activeCount = rows.filter((row) => action.value(row.id, row[flag] === true)).length;
  const detailUser = detailId
    ? rows.find((row) => row.id === detailId) ?? null
    : null;
  const detailRole = detailUser?.role;

  useEffect(() => {
    let active = true;
    if (!detailId || detailRole !== "CUSTOMER") return () => { active = false; };
    getStore<OrderStats>(
      `/admin/users/${encodeURIComponent(detailId)}/order-stats`,
    )
      .then((value) => {
        if (!active) return;
        if (validStats(value)) setStats(value);
        else setStatsError(true);
      })
      .catch(() => {
        if (active) setStatsError(true);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });
    return () => { active = false; };
  }, [detailId, detailRole, statsAttempt]);

  async function loadOrders(filter: OrderFilter, page: number, append = false, pageSize = 10, userId = detailId) {
    if (!userId || (userId === detailId && detailRole !== "CUSTOMER")) return;
    const request = ++ordersRequest.current;
    setOrdersLoading(true);
    setOrdersError(false);
    if (!append) setRecentOrders(null);
    const suffix = filter ? `&status=${filter}` : "";
    try {
      const value = await getStore<RecentOrderResponse>(
        `/admin/users/${encodeURIComponent(userId)}/orders?page=${page}&pageSize=${pageSize}${suffix}`,
      );
      if (request !== ordersRequest.current) return;
      if (!value || !Array.isArray(value.items) || !Number.isInteger(value.total)) {
        setOrdersError(true);
        return;
      }

      if (page === 1 && pageSize === 5 && !filter) setPreviewOrders(value.items);
      setRecentOrders((current) => append ? [...(current ?? []), ...value.items] : value.items);
      setOrdersTotal(value.total);
      setOrdersPage(value.page);
      setOrdersTotalPages(value.totalPages);
    } catch {
      if (request === ordersRequest.current) setOrdersError(true);
    } finally {
      if (request === ordersRequest.current) setOrdersLoading(false);
    }
  }

  useEffect(() => {
    if (!detailId || detailRole !== "CUSTOMER") return;
    const timer = window.setTimeout(() => void loadOrders("", 1, false, 5), 0);
    return () => window.clearTimeout(timer);
    // This local command intentionally uses the selected account from the current render.
  }, [detailId, detailRole, ordersAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  function openDetails(row: Row) {
    setPreviewOrders(null);
    ordersRequest.current += 1;
    setDetailId(row.id);
    setStats(null);
    setStatsError(false);
    setStatsLoading(row.role === "CUSTOMER");
    setStatsAttempt((value) => value + 1);
    setRecentOrders(null);
    setOrdersTotal(0);
    setOrdersPage(0);
    setOrdersTotalPages(0);
    setOrdersError(false);
    setOrdersLoading(false);
    setOrderFilter("");
    setDetailView("account");
    setOrderDetailId(null);
    if (row.role === "CUSTOMER") setOrdersAttempt((value) => value + 1);
  }

  function closeDetails() {
    setLinkedAccountId(null);
    setPreviewOrders(null);
    onDetailClose?.();
    ordersRequest.current += 1;
    setDetailId(null);
    setStats(null);
    setStatsError(false);
    setStatsLoading(false);
    setRecentOrders(null);
    setOrdersError(false);
    setOrdersLoading(false);
    setDetailView("account");
    setOrderDetailId(null);
  }

  function openOrder(id: string) {
    setOrderReturnView(detailView === "orders" ? "orders" : "account");
    setOrderDetailId(id);
    setDetailView("order");
  }
  function backFromOrder() {
    setOrderDetailId(null);
    setDetailView(orderReturnView);
  }
  const accountTitle = detailRole === "STAFF" ? "Chi tiết nhân viên" : detailRole === "ADMIN" ? "Chi tiết quản trị viên" : "Chi tiết khách hàng";
  const showStatsLoading = detailRole === "CUSTOMER" &&
    (statsLoading || (!stats && !statsError));

  function toggle(row: Row) {
    if (pending || (kind === "users" && (row.role === "ADMIN" || row.id === actor?.id))) return;
    const previous = action.value(row.id, row[flag] === true);
    const name = String(kind === "users" ? row.email : row.name);
    const change = { id: row.id, path: `/admin/${kind}/${encodeURIComponent(row.id)}`, field: flag, previous, next: !previous, message: kind === "users" ? `Đã ${previous ? "khóa" : "mở khóa"} tài khoản ${name}.` : `Đã ${previous ? "tắt" : "bật"} ${name}.`, undo: kind !== "users" };
    const count = counts.get(row.id) ?? 0;
    action.request(change, previous && kind === "categories" && count > 0 ? {
      title: `Tắt danh mục ${name}?`, description: `Danh mục có ${count} món. Các món này sẽ ẩn khỏi thực đơn của khách.`, action: "Tắt danh mục",
    } : previous && kind === "users" ? {
      title: `Khóa tài khoản ${name}?`, description: "Người này sẽ không đăng nhập được nữa. Bạn có thể mở khóa lại bất cứ lúc nào.", action: "Khóa tài khoản",
    } : undefined);
  }
  const placeholder = kind === "users" ? "Tìm tên hoặc email" : `Tìm ${titles[kind].toLocaleLowerCase("vi-VN")}`;
  return <section className="catalog-management">
    {!detailsOnly && <>
    {action.feedback}
    <div className="promotions-heading"><div>
      <p>{accountSearch ? `${accountSearch.total} tài khoản phù hợp, ${rows.length} tài khoản trên trang này` : <>{rows.length} {titles[kind].toLocaleLowerCase("vi-VN")}{kind === "categories" ? `, ${rows.reduce((sum, row) => sum + (counts.get(row.id) ?? 0), 0)} món` : ""}, {activeCount} {kind === "users" ? "đang hoạt động" : kind === "toppings" ? "đang bán" : "đang dùng"}</>}</p>
    </div>{kind !== "users" && <button onClick={() => onEdit(null)}>+ Thêm {titles[kind].toLocaleLowerCase("vi-VN")}</button>}</div>
    <div className="admin-search-bar"><div className="admin-search-field">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
    </div><button aria-label={`Làm mới ${titles[kind].toLocaleLowerCase("vi-VN")}`} title="Làm mới" disabled={pending !== null} onClick={onRefresh}>↻</button>
      {!accountSearch && (query || role) && <p role="status">{filtered.length} / {rows.length} kết quả</p>}
    </div>
    {kind === "users" && <div className="account-role-filters" aria-label="Lọc vai trò">
      {[["", "Tất cả"], ...Object.entries(roles)].map(([value, label]) => <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>)}
    </div>}
    <div className="admin-table management-table"><table className={kind === "users" ? "user-management-table" : undefined}><thead><tr>
      <th>{kind === "users" ? "Tài khoản" : titles[kind]}</th>
      <th>{kind === "users" ? "Vai trò" : kind === "toppings" ? "Giá thêm" : "Số món"}</th>
      <th>{kind === "users" ? "Hoạt động" : kind === "toppings" ? "Đang bán" : "Đang dùng"}</th><th>{kind === "users" ? "Thao tác" : "Chỉnh sửa"}</th>
    </tr></thead><tbody>{filtered.map((row) => {
      const name = String(kind === "users" ? row.email : row.name);
      const protectedUser = kind === "users" && (row.role === "ADMIN" || row.id === actor?.id);
      const count = counts.get(row.id) ?? 0;
      return <tr key={row.id}>
        <td><div className="management-identity"><span className={`management-avatar${kind === "users" ? " account-avatar" : ""}`} aria-hidden="true">{kind === "users" ? name.slice(0, 1).toLocaleUpperCase("vi-VN") : kind === "toppings" ? <ToppingIcon name={name} /> : <CategoryIcon name={name} />}</span><span>{kind === "users" ? name : <strong>{name}</strong>}</span></div></td>
        <td>{kind === "users" ? <span className={`account-role ${row.role === "ADMIN" ? "owner" : row.role === "STAFF" ? "staff" : "customer"}`}>{roles[String(row.role)] ?? "Chưa xác định"}</span> : kind === "toppings" ? <strong>+{formatPrice(String(row.price))}đ</strong> : <div className="category-count"><span className="category-count-track" aria-hidden="true"><span style={{ width: `${count / largest * 100}%` }} /></span><strong>{count} món</strong></div>}</td>
        <td><button type="button" className="promotion-switch" role="switch" aria-label={`${kind === "users" ? "Hoạt động" : "Áp dụng"} ${name}`} aria-checked={action.value(row.id, row[flag] === true)} disabled={pending !== null || protectedUser} title={protectedUser ? "Không thể khóa tài khoản ADMIN hoặc chính mình" : undefined} onClick={() => toggle(row)}><span /></button>{protectedUser && <span className="admin-lock-icon" aria-label="Tài khoản được bảo vệ"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>}</td>
        <td>{kind === "users" ? <span className="admin-user-actions"><button type="button" className="inventory-icon-button admin-user-details-trigger" aria-label={`Xem chi tiết ${name}`} aria-expanded={detailId === row.id} title="Xem chi tiết" onClick={() => openDetails(row)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={detailId === row.id ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg></button><button type="button" className="inventory-icon-button" aria-label={`Sửa ${name}`} disabled={protectedUser} title={protectedUser ? "Tài khoản ADMIN được bảo vệ" : undefined} onClick={() => onEdit(row)}><Pencil /></button></span> : <button type="button" className="inventory-icon-button" aria-label={`Sửa ${name}`} disabled={protectedUser} title={protectedUser ? "Tài khoản ADMIN được bảo vệ" : undefined} onClick={() => onEdit(row)}><Pencil /></button>}</td>
      </tr>;
    })}</tbody></table></div>
    {accountSearch?.loading && <p role="status">Đang tải tài khoản…</p>}
    {accountSearch?.error && <p role="alert">Không thể tải tài khoản. <button onClick={accountSearch.onRetry}>Thử lại</button></p>}
    {!accountSearch?.loading && !accountSearch?.error && filtered.length === 0 && <p role="status">{accountSearch || rows.length ? "Không tìm thấy kết quả phù hợp." : "Chưa có dữ liệu."}</p>}
    {accountSearch && accountSearch.totalPages > 0 && <nav aria-label="Phân trang tài khoản" className="store-actions">
      <button disabled={accountSearch.loading || accountSearch.page <= 1} onClick={() => accountSearch.onPage(accountSearch.page - 1)}>Trang trước</button>
      <span>Trang {accountSearch.page} / {accountSearch.totalPages}</span>
      <button disabled={accountSearch.loading || accountSearch.page >= accountSearch.totalPages} onClick={() => accountSearch.onPage(accountSearch.page + 1)}>Trang sau</button>
    </nav>}
    </>}
    {detailUser && <CenteredDialog className={detailView === "order" ? "admin-order-detail-dialog" : "admin-user-details-dialog account-profile-dialog"} label={detailView === "order" ? "Chi tiết đơn hàng" : detailView === "orders" ? "Danh sách đơn hàng" : accountTitle} onClose={closeDetails}>
      {detailView === "order" && orderDetailId ? <AdminOrderDetailContent key={orderDetailId} orderId={orderDetailId} onClose={closeDetails} onBack={backFromOrder} onOpenAccount={actor?.role === "ADMIN" ? (id) => { if (id === detailUser.id) { setOrderDetailId(null); setDetailView("account"); } else setLinkedAccountId(id); } : undefined} /> : <>
        <header className="account-profile-head">{detailView === "orders" && <button type="button" className="account-profile-back" aria-label="Quay lại" onClick={() => setDetailView("account")}><span aria-hidden="true">←</span> Quay lại</button>}<h2>{detailView === "orders" ? "Danh sách đơn hàng" : accountTitle}</h2><button ref={profileCloseRef} type="button" className="account-profile-close" aria-label="Đóng chi tiết tài khoản" onClick={closeDetails}>×</button></header>
        <div className="account-profile-body" key={detailView}>
          {detailView === "orders" ? <section className="admin-user-order-list">
            <p className="account-profile-owner">{typeof detailUser.fullName === "string" && detailUser.fullName ? detailUser.fullName : String(detailUser.email ?? "")}</p>
            <div className="admin-order-filters" aria-label="Lọc đơn hàng">{[["", "Tất cả"], ["COMPLETED", "Hoàn tất"], ["CANCELLED", "Đã hủy"]].map(([value, label]) => <button key={value} type="button" aria-pressed={orderFilter === value} onClick={() => { const next = value as OrderFilter; setOrderFilter(next); void loadOrders(next, 1, false); }}>{label}</button>)}</div>
            {ordersLoading && <p role="status">Đang tải đơn hàng…</p>}
            {ordersError && <p role="alert">Không thể tải danh sách đơn hàng. <button type="button" onClick={() => void loadOrders(orderFilter, ordersPage || 1, false)}>Thử lại</button></p>}
            {!ordersLoading && !ordersError && recentOrders && <>{!recentOrders.length && <p>Chưa có đơn hàng.</p>}<AccountOrderList orders={recentOrders} onOpenOrder={openOrder} /></>}
            {!ordersLoading && !ordersError && ordersTotal > 0 && <div className="account-orders-foot"><span>Đã hiển thị {recentOrders?.length ?? 0} / {ordersTotal}</span>{ordersPage < ordersTotalPages && <button type="button" className="account-load-more" onClick={() => void loadOrders(orderFilter, ordersPage + 1, true)}>Tải thêm 10 đơn</button>}</div>}
          </section> : <>
            <section><h3>Thông tin tài khoản</h3><dl className="account-profile-fields">
              <div><dt>Họ tên</dt><dd>{typeof detailUser.fullName === "string" && detailUser.fullName ? detailUser.fullName : "Chưa có dữ liệu"}</dd></div>
              <div><dt>Email</dt><dd>{typeof detailUser.email === "string" ? detailUser.email : "Chưa có dữ liệu"}</dd></div>
              <div><dt>{detailRole === "STAFF" ? "Mã nhân viên" : "Mã tài khoản"}</dt><dd className="account-profile-code">{detailUser.id}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{typeof detailUser.createdAt === "string" ? accountDateTime(detailUser.createdAt) : "Chưa có dữ liệu"}</dd></div>
              <div><dt>Vai trò</dt><dd><span className={`account-field-badge role-${String(detailUser.role).toLowerCase()}`}>{roles[String(detailUser.role)] ?? "Chưa có dữ liệu"}</span></dd></div>
              <div><dt>Trạng thái</dt><dd><span className={`account-field-badge ${detailUser.isActive === true ? "is-active" : "is-locked"}`}>{detailUser.isActive === true ? "Đang hoạt động" : "Đã khóa"}</span></dd></div>
              <div><dt>Xác minh email</dt><dd><span className={`account-field-badge ${detailUser.emailVerifiedAt ? "is-verified" : "is-unverified"}`}>{verificationLabel(detailUser.emailVerifiedAt)}</span></dd></div>
            </dl></section>
            {(detailRole === "STAFF" || detailRole === "ADMIN") && <AdminStaffActivity key={detailUser.id} userId={detailUser.id} onOpenOrder={openOrder} />}
            {detailRole === "CUSTOMER" && <section>
              <h3>Điểm thưởng</h3><p className="account-profile-points">{typeof detailUser.loyaltyPoints === "number" && Number.isInteger(detailUser.loyaltyPoints) && detailUser.loyaltyPoints >= 0 ? `${detailUser.loyaltyPoints} điểm` : "Chưa có dữ liệu"}</p>
              <h3>Thống kê đơn hàng</h3>
              {showStatsLoading && <p role="status">Đang tải thống kê đơn hàng…</p>}
              {statsError && <div role="alert">Không thể tải thống kê đơn hàng <button type="button" onClick={() => { setStatsError(false); setStats(null); setStatsLoading(true); setStatsAttempt((value) => value + 1); }}>Thử lại</button></div>}
              {stats && <div className="account-stat-grid">
                <button type="button" onClick={() => { setOrderFilter(""); setDetailView("orders"); void loadOrders("", 1, false); }}><strong>{stats.totalOrders}</strong><span>Tổng đơn hàng</span></button>
                <button type="button" onClick={() => { setOrderFilter("COMPLETED"); setDetailView("orders"); void loadOrders("COMPLETED", 1, false); }}><strong>{stats.completedOrders}</strong><span>Đơn hoàn tất</span></button>
                <button type="button" onClick={() => { setOrderFilter("CANCELLED"); setDetailView("orders"); void loadOrders("CANCELLED", 1, false); }}><strong>{stats.cancelledOrders}</strong><span>Đơn đã hủy</span></button>
              </div>}
              <div className="account-section-heading"><h3>Đơn hàng gần đây</h3><button type="button" className="account-view-all" onClick={() => { setOrderFilter(""); setDetailView("orders"); void loadOrders("", 1, false); }}>Xem tất cả{stats ? ` ${stats.totalOrders}` : ""} đơn</button></div>
              {ordersLoading && !previewOrders && <p role="status">Đang tải đơn hàng gần đây…</p>}
              {ordersError && <div role="alert">Không thể tải đơn hàng gần đây <button type="button" onClick={() => setOrdersAttempt((value) => value + 1)}>Thử lại</button></div>}
              {previewOrders && <>{!previewOrders.length && <p>Chưa có đơn hàng.</p>}<AccountOrderList orders={previewOrders.slice(0, 5)} onOpenOrder={openOrder} /></>}
            </section>}
          </>}
        </div>
      </>}
    </CenteredDialog>}
    {linkedAccountId && <Suspense fallback={<p role="status">Đang tải hồ sơ…</p>}><LinkedAccountDialog key={linkedAccountId} userId={linkedAccountId} onClose={() => setLinkedAccountId(null)} /></Suspense>}
  </section>;
}
