"use client";

import { useState } from "react";
import { formatPrice } from "../../lib/format-price";
import { normalizeSearch } from "../../lib/normalize-search";
import { useAuthUser } from "../../lib/auth-store";
import { useAdminToggle } from "./use-admin-toggle";
import { Pencil } from "./inventory-table";

type Row = Record<string, unknown> & { id: string };
type Kind = "categories" | "toppings" | "users";
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

export function CatalogManagement({ kind, rows, products, onEdit, onRefresh }: {
  kind: Kind; rows: Row[]; products: Row[]; onEdit: (row: Row | null) => void; onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const actor = useAuthUser();
  const action = useAdminToggle(onRefresh);
  const pending = action.pending;
  const flag = kind === "toppings" ? "isAvailable" : "isActive";
  const filtered = rows.filter((row) => normalizeSearch([row.name, row.fullName, row.email].filter(Boolean).join(" ")).includes(normalizeSearch(query)) && (!role || row.role === role));
  const counts = new Map<string, number>();
  products.forEach((product) => { const id = String(product.categoryId ?? ""); counts.set(id, (counts.get(id) ?? 0) + 1); });
  const largest = Math.max(1, ...counts.values());
  const activeCount = rows.filter((row) => action.value(row.id, row[flag] === true)).length;
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
    {action.feedback}
    <div className="promotions-heading"><div>
      <p>{rows.length} {titles[kind].toLocaleLowerCase("vi-VN")}{kind === "categories" ? `, ${rows.reduce((sum, row) => sum + (counts.get(row.id) ?? 0), 0)} món` : ""}, {activeCount} {kind === "users" ? "đang hoạt động" : kind === "toppings" ? "đang bán" : "đang dùng"}</p>
    </div>{kind !== "users" && <button onClick={() => onEdit(null)}>+ Thêm {titles[kind].toLocaleLowerCase("vi-VN")}</button>}</div>
    <div className="admin-search-bar"><div className="admin-search-field">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />
    </div><button aria-label={`Làm mới ${titles[kind].toLocaleLowerCase("vi-VN")}`} title="Làm mới" disabled={pending !== null} onClick={onRefresh}>↻</button>
      {(query || role) && <p role="status">{filtered.length} / {rows.length} kết quả</p>}
    </div>
    {kind === "users" && <div className="account-role-filters" aria-label="Lọc vai trò">
      {[["", "Tất cả"], ...Object.entries(roles)].map(([value, label]) => <button key={value} aria-pressed={role === value} onClick={() => setRole(value)}>{label}</button>)}
    </div>}
    <div className="admin-table management-table"><table><thead><tr>
      <th>{kind === "users" ? "Tài khoản" : titles[kind]}</th>
      <th>{kind === "users" ? "Vai trò" : kind === "toppings" ? "Giá thêm" : "Số món"}</th>
      <th>{kind === "users" ? "Hoạt động" : kind === "toppings" ? "Đang bán" : "Đang dùng"}</th><th>Chỉnh sửa</th>
    </tr></thead><tbody>{filtered.map((row) => {
      const name = String(kind === "users" ? row.email : row.name);
      const protectedUser = kind === "users" && (row.role === "ADMIN" || row.id === actor?.id);
      const count = counts.get(row.id) ?? 0;
      return <tr key={row.id}>
        <td><div className="management-identity"><span className={`management-avatar${kind === "users" ? " account-avatar" : ""}`} aria-hidden="true">{kind === "users" ? name.slice(0, 1).toLocaleUpperCase("vi-VN") : kind === "toppings" ? <ToppingIcon name={name} /> : <CategoryIcon name={name} />}</span><span>{kind === "users" ? name : <strong>{name}</strong>}</span></div></td>
        <td>{kind === "users" ? <span className={`account-role ${row.role === "ADMIN" ? "owner" : row.role === "STAFF" ? "staff" : "customer"}`}>{roles[String(row.role)] ?? "Chưa xác định"}</span> : kind === "toppings" ? <strong>+{formatPrice(String(row.price))}đ</strong> : <div className="category-count"><span className="category-count-track" aria-hidden="true"><span style={{ width: `${count / largest * 100}%` }} /></span><strong>{count} món</strong></div>}</td>
        <td><button type="button" className="promotion-switch" role="switch" aria-label={`${kind === "users" ? "Hoạt động" : "Áp dụng"} ${name}`} aria-checked={action.value(row.id, row[flag] === true)} disabled={pending !== null || protectedUser} title={protectedUser ? "Không thể khóa tài khoản ADMIN hoặc chính mình" : undefined} onClick={() => toggle(row)}><span /></button>{protectedUser && <span className="admin-lock-icon" aria-label="Tài khoản được bảo vệ"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>}</td>
        <td><button className="inventory-icon-button" aria-label={`Sửa ${name}`} disabled={protectedUser} title={protectedUser ? "Tài khoản ADMIN được bảo vệ" : undefined} onClick={() => onEdit(row)}><Pencil /></button></td>
      </tr>;
    })}</tbody></table></div>
    {filtered.length === 0 && <p role="status">{rows.length ? "Không tìm thấy kết quả phù hợp." : "Chưa có dữ liệu."}</p>}
  </section>;
}
