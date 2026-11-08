"use client";
import { useAdminToggle } from "./use-admin-toggle";
export function ProductAvailability({ id, name, available, onRefresh }: { id: string; name: string; available: boolean; onRefresh: () => void }) {
  const action = useAdminToggle(onRefresh);
  const checked = action.value(id, available);
  return <>{action.feedback}<button type="button" className="promotion-switch" role="switch" aria-label={`Đang bán ${name}`} aria-checked={checked} disabled={action.pending !== null} onClick={() => action.request({ id, path: `/admin/products/${encodeURIComponent(id)}`, field: "isAvailable", previous: checked, next: !checked, message: `Đã ${checked ? "ẩn" : "hiện"} sản phẩm ${name}.`, undo: true })}><span /></button></>;
}
