import { formatPrice } from '../../lib/format-price';
import type { Order } from '../../services/store.service';

export type OverviewProduct = { id: string; name: string; isAvailable: boolean; category?: { isActive: boolean } | null };
export type OverviewSize = { id: string; productId: string; name: string; onHand: number | null; reserved: number; isAvailable: boolean };
export type OverviewData = {
  paidOrders: number;
  simulatedRevenue: string;
  products: number;
  pendingCashShifts?: number;
  pendingCashTotal?: string;
  label: string;
};
const sections = [
  { title: 'Bán hàng', entries: [
    { key: 'orders', title: 'Giám sát đơn', icon: 'orders' },
    { key: 'cashShifts', title: 'Quỹ tiền mặt', icon: 'chart' },
    { key: 'promotions', title: 'Mã giảm giá', icon: 'ticket' },
  ] },
  { title: 'Thực đơn', entries: [
    { key: 'products', title: 'Sản phẩm', icon: 'cup' },
    { key: 'categories', title: 'Danh mục', icon: 'grid' },
    { key: 'sizes', title: 'Size và tồn kho', icon: 'box' },
    { key: 'toppings', title: 'Topping', icon: 'topping' },
  ] },
  { title: 'Tài khoản', entries: [
    { key: 'users', title: 'Tài khoản', icon: 'users' },
  ] },
];
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
    ticket: <><path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z" /><path d="M14 7v2m0 2v2m0 2v2" /></>,
    cup: <><path d="M4 9h13v6a6.5 6.5 0 0 1-13 0V9Zm13 1h2a3 3 0 0 1 0 6h-2M3 22h16M7 3v3m4-4v4m4-3v3" /></>,
    grid: <><rect x="3" y="3" width="6" height="6" /><rect x="15" y="3" width="6" height="6" /><rect x="3" y="15" width="6" height="6" /><rect x="15" y="15" width="6" height="6" /></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5" /></>,
    topping: <><path d="M8 17V7a4 4 0 0 1 8 0v10H8Zm4 0v5M8 10l8-4M8 15l8-4" /></>,
    users: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m3 11v-4a6 6 0 0 0-3-5" /></>,
    chart: <><path d="M3 21h18M5 21V11h4v10m2 0V4h4v17m2 0v-7h4v7" /></>,
  };
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.grid}</svg>;
}
export function AdminOverview({ data, products, sizes, orders, now, onNavigate, mode }: { data: OverviewData; products: OverviewProduct[]; sizes: OverviewSize[]; orders: Order[]; now: number; onNavigate: (key: string) => void; mode?: "summary" | "statistics" }) {
  const activeProducts = products.filter((product) => product.isAvailable && product.category?.isActive !== false);
  const activeIds = new Set(activeProducts.map((product) => product.id));
  const activeSizes = sizes.filter((size) => size.isAvailable && activeIds.has(size.productId));
  const uninitialized = activeSizes.filter((size) => size.onHand === null);
  const low = activeSizes.filter((size) => size.onHand !== null && size.onHand - size.reserved <= 3);
  const expired = orders.filter((order) => order.status === 'PENDING' && order.expiresAt && new Date(order.expiresAt).getTime() < now);
  const pendingShifts = data.pendingCashShifts ?? 0;
  const alerts = [
    ...(pendingShifts > 0 ? [{ key: 'cashShifts', text: `${pendingShifts} ca thu ngân đã đóng chờ thu quỹ.`, action: 'Thu quỹ' }] : []),
    ...(expired.length ? [{ key: 'orders', text: `${expired.length} đơn quá hạn giữ hàng cần kiểm tra trong danh sách đơn gần nhất.`, action: 'Xem đơn' }] : []),
    ...(uninitialized.length ? [{ key: 'sizes', text: `${uninitialized.length} Size của món đang bán chưa nhập tồn kho.`, action: 'Nhập kho' }] : []),
    ...(low.length ? [{ key: 'sizes', text: `${low.length} Size có tồn khả dụng từ 0 đến 3 ly.`, action: 'Kiểm tra tồn' }] : []),
  ];
  return <div className="admin-overview">
    <div className="admin-metrics" style={data.pendingCashTotal !== undefined ? { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } : undefined}>
      <article><p>Đơn đã thanh toán</p><strong>{data.paidOrders}</strong></article>
      <article><p>Doanh thu</p><strong>{formatPrice(data.simulatedRevenue)}đ</strong></article>
      <article><p>Sản phẩm đang bán</p><strong>{activeProducts.length}</strong>{products.length - activeProducts.length > 0 && <span>{products.length - activeProducts.length} món đang ẩn</span>}</article>
      {data.pendingCashTotal !== undefined && (
        <article style={pendingShifts > 0 ? { background: '#fff9ec', borderColor: '#d9a74a' } : undefined}>
          <p>Quỹ tiền mặt chờ thu</p>
          <strong>{formatPrice(data.pendingCashTotal)}đ</strong>
          <span>{pendingShifts} ca đã đóng</span>
        </article>
      )}
    </div>
    {mode !== "statistics" && <section className="admin-attention" aria-label="Cần xử lý"><header><h2>Cần xử lý</h2><span>{alerts.length}</span></header>
      {!alerts.length && <p className="admin-no-alerts">Chưa có cảnh báo cần xử lý trong dữ liệu hiện tại.</p>}
      {alerts.map((alert, index) => <div className="admin-alert-row" key={`${alert.key}-${index}`}><span className="admin-alert-symbol" aria-hidden="true">!</span><p>{alert.text}</p><button onClick={() => onNavigate(alert.key)}>{alert.action}</button></div>)}
    </section>}
    {mode !== "summary" && <details className="admin-statistics" open={mode === "statistics"}><summary><Icon name="chart" /><span><strong>Thống kê chi tiết</strong></span><span className="admin-chevron" aria-hidden="true">›</span></summary>
      <dl><div><dt>Tổng số sản phẩm</dt><dd>{products.length}</dd></div><div><dt>Tổng số Size</dt><dd>{sizes.length}</dd></div><div><dt>Size chưa nhập tồn</dt><dd>{uninitialized.length}</dd></div><div><dt>Đơn gần nhất</dt><dd>{orders.length}</dd></div></dl>
    </details>}
    {!mode && sections.map((section) => <section className="admin-function-group" key={section.title}><h2>{section.title}</h2><div className="admin-function-grid">{section.entries.map((entry) => <button className="admin-function-card" key={entry.key} onClick={() => onNavigate(entry.key)}><span className="admin-function-icon"><Icon name={entry.icon} /></span><span className="admin-function-copy"><strong>{entry.title}</strong></span><span className="admin-chevron" aria-hidden="true">›</span></button>)}</div></section>)}
  </div>;
}
