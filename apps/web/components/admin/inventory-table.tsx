"use client";
import { useState } from "react";
import { formatPrice } from "../../lib/format-price";
import { InventoryEditor, type InventoryRow } from "../product/inventory-editor";

type Row = Record<string, unknown> & { id: string };
export function InventoryTable({ rows, products, onEdit, onSaved }: {
  rows: Row[]; products: Row[]; onEdit: (row: Row) => void; onSaved: () => void;
}) {
  const [previews, setPreviews] = useState<Record<string, number | null>>({});
  const groups = Map.groupBy(rows, (row) => String(row.productId ?? ""));
  return <div className="inventory-groups">{Array.from(groups, ([id, sizes]) => {
    const name = String(products.find((product) => product.id === id)?.name ?? "Sản phẩm chưa xác định");
    return <section className="inventory-group" key={id}>
      <h2>{name}<span>{sizes.length} size</span></h2>
      <div className="admin-table inventory-compact-table"><table>
        <thead><tr>{["Size", "Phụ phí", "Trong kho", "Đang giữ", "Có thể bán", "Trạng thái", "Chỉnh sửa"].map((title) => <th key={title}>{title}</th>)}</tr></thead>
        <tbody>{sizes.map((row) => {
          const available = row.onHand == null ? null : Number(row.onHand) - Number(row.reserved);
          const status = row.sellingStatus === "STOPPED" ? "Ngừng bán" : available === null ? "Chưa nhập tồn" : available <= 0 ? "Hết hàng" : available <= 5 ? "Sắp hết" : "Đang bán";
          const tone = status === "Sắp hết" ? "low" : status === "Đang bán" ? "available" : status === "Hết hàng" ? "empty" : "muted";
          return <tr key={row.id}>
            <td><strong>{String(row.name)}</strong></td>
            <td>{Number(row.extraPrice) === 0 ? "Không phụ phí" : `+${formatPrice(String(row.extraPrice))}đ`}</td>
            <td><InventoryEditor row={row as InventoryRow} productName={name} onSaved={onSaved} selling={row.sellingStatus !== "STOPPED"} onPreview={(value) => setPreviews((old) => ({ ...old, [row.id]: value }))} /></td>
            <td>{Number(row.reserved)}</td><td>{previews[row.id] != null && Number(previews[row.id]) - Number(row.reserved) !== available ? <span className="inventory-preview"><span>{available ?? "—"} → </span><strong>{Number(previews[row.id]) - Number(row.reserved)}</strong></span> : available ?? "—"}</td>
            <td><span className={`inventory-status ${tone}`}>{status}</span></td>
            <td><button className="inventory-icon-button" aria-label={`Sửa ${name}, size ${String(row.name)}`} onClick={() => onEdit(row)}><Pencil /></button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>;
  })}</div>;
}

export function Pencil() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>;
}
