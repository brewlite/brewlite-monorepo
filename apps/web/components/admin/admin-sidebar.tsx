import Link from "next/link";

const groups = [
  { title: "", items: [["dashboard", "Tổng quan"], ["statistics", "Thống kê"]] },
  { title: "Bán hàng", items: [["orders", "Giám sát đơn"], ["cashShifts", "Quỹ tiền mặt"], ["promotions", "Mã giảm giá"]] },
  { title: "Thực đơn", items: [["products", "Sản phẩm"], ["categories", "Danh mục"], ["sizes", "Size và tồn kho"], ["toppings", "Topping"]] },
  { title: "Người dùng", items: [["users", "Tài khoản"]] },
];
export function AdminSidebar({ current, onNavigate }: { current: string; onNavigate: (key: string) => void }) {
  return <aside className="admin-sidebar"><div className="admin-sidebar-brand"><span aria-hidden="true">B</span>Quản trị</div>
    <nav aria-label="Quản trị">{groups.map((group) => <div className="admin-sidebar-group" key={group.title}>
      {group.title && <p>{group.title}</p>}
      {group.items.map(([key, label]) => <button key={key} aria-current={current === key ? "page" : undefined} onClick={() => onNavigate(key)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{key === "statistics" ? <path d="M4 20V10h4v10m3 0V4h4v16m3 0v-6h3v6M2 21h21" /> : key === "users" ? <><circle cx="12" cy="7" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></> : <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 14h5" /></>}</svg>{label}
      </button>)}
    </div>)}<Link className="admin-store-link" href="/menu" target="_blank" rel="noopener noreferrer">Xem thực đơn ↗</Link><Link className="admin-store-link" href="/">← Về cửa hàng</Link></nav>
  </aside>;
}
