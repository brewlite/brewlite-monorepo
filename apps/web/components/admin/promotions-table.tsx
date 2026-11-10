"use client";

import { useState } from "react";
import { formatPrice } from "../../lib/format-price";
import { normalizeSearch } from "../../lib/normalize-search";
import { useAdminToggle } from "./use-admin-toggle";
import { Pencil } from "./inventory-table";

type Row = Record<string, unknown> & { id: string };
function date(value: unknown) {
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
export function PromotionsTable({ rows, onEdit, onRefresh }: {
  rows: Row[]; onEdit: (row: Row | null) => void; onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const action = useAdminToggle(onRefresh);
  const pending = action.pending;
  const filtered = rows.filter((row) => normalizeSearch(String(row.code)).includes(normalizeSearch(query)));
  function toggle(row: Row) {
    if (pending) return;
    const previous = action.value(row.id, row.isActive === true);
    action.request({ id: row.id, path: `/admin/promotions/${encodeURIComponent(row.id)}`, field: "isActive", previous, next: !previous, message: `Đã ${previous ? "tắt" : "bật"} mã ${row.code}.`, undo: true });
  }
  return <section className="promotions-panel">
    {action.feedback}
    <div className="promotions-heading"><div><p>{rows.length} mã, {rows.filter((row) => action.value(row.id, row.isActive === true)).length} mã đang bật áp dụng</p></div>
      <button onClick={() => onEdit(null)}>+ Thêm mã</button></div>
    <div className="admin-search-bar">
      <div className="admin-search-field"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input type="search" aria-label="Tìm mã giảm giá" placeholder="Tìm mã giảm giá" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button aria-label="Làm mới mã giảm giá" title="Làm mới" disabled={pending !== null} onClick={onRefresh}>↻</button>
      {query && <p role="status">{filtered.length} / {rows.length} kết quả</p>}
    </div>
    <div className="admin-table promotions-table"><table><thead><tr>{["Mã", "Mức giảm", "Đơn tối thiểu", "Giảm tối đa", "Lượt dùng", "Thời hạn", "Áp dụng", "Chỉnh sửa"].map((title) => <th key={title}>{title}</th>)}</tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}>
        <td><strong>{String(row.code)}</strong></td>
        <td>{row.discountType === "PERCENTAGE" ? `${row.discountValue}%` : `${formatPrice(String(row.discountValue))}đ`}</td>
        <td>{formatPrice(String(row.minOrderValue))}đ</td>
        <td>{row.maxDiscount == null ? "Theo chính sách" : `${formatPrice(String(row.maxDiscount))}đ`}</td>
        <td><span title="Đã dùng / giới hạn">{Number(row.usedCount ?? 0)} / {Number(row.usageLimit)}</span></td>
        <td className="promotion-dates">{date(row.startDate)} – {date(row.endDate)}</td>
        <td><button className="promotion-switch" type="button" role="switch" aria-label={`Áp dụng ${row.code}`} aria-checked={action.value(row.id, row.isActive === true)} disabled={pending !== null} onClick={() => toggle(row)}><span /></button></td>
        <td><button className="inventory-icon-button" aria-label={`Sửa mã ${row.code}`} onClick={() => onEdit(row)}><Pencil /></button></td>
      </tr>)}</tbody></table></div>
    {filtered.length === 0 && <p role="status">{rows.length ? "Không tìm thấy mã phù hợp." : "Chưa có mã giảm giá."}</p>}
  </section>;
}
