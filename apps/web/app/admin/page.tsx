"use client";
import { useEffect, useRef, useState } from "react";
import { SiteFrame } from "../../components/layout/site-frame";
import { getStore, sendStore, type Order } from "../../services/store.service";
import { authError } from "../../services/auth.service";
import { formatPrice } from "../../lib/format-price";
import { normalizeSearch } from "../../lib/normalize-search";
import { AdminOverview, type OverviewProduct, type OverviewSize } from '../../components/admin/admin-overview';
import { CenteredDialog } from '../../components/ui/centered-dialog';
import { InventoryTable, Pencil } from '../../components/admin/inventory-table';
import { PromotionsTable } from '../../components/admin/promotions-table';
import { CatalogManagement } from '../../components/admin/catalog-management';
import { AdminSidebar } from '../../components/admin/admin-sidebar';
import { OrderMonitor } from '../../components/admin/order-monitor';
import { ProductAvailability } from '../../components/admin/product-availability';
import { ProductImagePicker } from '../../components/admin/product-image-picker';
import { ProductCategoryFilter, filterAdminProducts } from '../../components/admin/product-category-filter';
import { authHttp } from '../../services/auth.service';
import { apiUrl } from '../../services/product.service';
type Row = Record<string, unknown> & { id: string };
type Field = {
  key: string;
  label: string;
  type?: "number" | "checkbox" | "datetime-local" | "textarea";
  options?: string[];
  source?: "products" | "categories";
};
const fields: Record<string, Field[]> = {
  categories: [
    { key: "name", label: "Tên danh mục" },
    { key: "isActive", label: "Đang sử dụng", type: "checkbox" },
  ],
  products: [
    { key: "name", label: "Tên sản phẩm" },
    { key: "description", label: "Mô tả", type: "textarea" },
    { key: "basePrice", label: "Giá cơ bản (VND)", type: "number" },
    { key: "imageUrl", label: "Đường dẫn ảnh" },
    { key: "categoryId", label: "Danh mục", source: "categories" },
    { key: "isAvailable", label: "Đang bán", type: "checkbox" },
  ],
  sizes: [
    { key: "name", label: "Tên size" },
    { key: "productId", label: "Sản phẩm", source: "products" },
    { key: "extraPrice", label: "Giá cộng thêm (VND)", type: "number" },
    { key: "isAvailable", label: "Khả dụng", type: "checkbox" },
  ],
  toppings: [
    { key: "name", label: "Tên topping" },
    { key: "price", label: "Giá (VND)", type: "number" },
    { key: "isAvailable", label: "Khả dụng", type: "checkbox" },
  ],
  promotions: [
    { key: "code", label: "Mã giảm giá" },
    {
      key: "discountType",
      label: "Loại",
      options: ["FIXED_AMOUNT", "PERCENTAGE"],
    },
    { key: "discountValue", label: "Giá trị", type: "number" },
    { key: "minOrderValue", label: "Đơn tối thiểu (VND)", type: "number" },
    {
      key: "maxDiscount",
      label: "Giảm tối đa (VND), bỏ trống nếu không có",
      type: "number",
    },
    { key: "usageLimit", label: "Giới hạn lượt dùng", type: "number" },
    { key: "startDate", label: "Bắt đầu", type: "datetime-local" },
    { key: "endDate", label: "Kết thúc", type: "datetime-local" },
    { key: "isActive", label: "Đang áp dụng", type: "checkbox" },
  ],
  users: [
    { key: "role", label: "Vai trò", options: ["CUSTOMER", "STAFF"] },
    { key: "isActive", label: "Đang hoạt động", type: "checkbox" },
  ],
};
const names: Record<string, string> = {
  dashboard: "Tổng quan",
  statistics: "Thống kê",
  categories: "Danh mục",
  products: "Sản phẩm",
  sizes: "Size và tồn kho",
  toppings: "Topping",
  promotions: "Mã giảm giá",
  users: "Tài khoản",
  orders: "Giám sát đơn",
};
const primaryLabels: Record<string, string> = { products: 'Tên sản phẩm', categories: 'Tên danh mục', sizes: 'Tên Size', toppings: 'Tên topping', promotions: 'Mã giảm giá', users: 'Email' };
function display(v: unknown) {
  return typeof v === "string" || typeof v === "number"
    ? String(v)
    : typeof v === "boolean"
      ? v
        ? "Có"
        : "Không"
      : "—";
}
export default function AdminPage() {
  const [kind, setKind] = useState("dashboard");
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [loadingHeight, setLoadingHeight] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dashboard, setDashboard] = useState<{
    simulatedRevenue: string;
    paidOrders: number;
    products: number;
    label: string;
  } | null>(null);
  const [lookups, setLookups] = useState<Record<string, Row[]>>({});
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [formError, setFormError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formConfirmation, setFormConfirmation] = useState<{ title: string; description: string; action: string } | null>(null);
  const [overviewDetails, setOverviewDetails] = useState<{ products: OverviewProduct[]; sizes: OverviewSize[]; orders: Order[]; now: number }>({ products: [], sizes: [], orders: [], now: 0 });
  function navigate(next: string) {
    if (next === kind) return;
    setLoadingHeight(workspaceRef.current?.getBoundingClientRect().height ?? 0);
    setKind(next); setLoading(true); setEditing(false); setSearch(''); setCategoryFilter('');
  }
  const filteredRows = rows.filter((row) => {
    if (kind !== 'sizes') {
      const category = lookups.categories?.find((item) => item.id === row.categoryId);
      return normalizeSearch([row.name, row.fullName, row.email, row.code, row.description, category?.name].filter((value) => typeof value === 'string').join(' ')).includes(normalizeSearch(search));
    }
    const product = lookups.products?.find((item) => item.id === row.productId);
    return (!productFilter || row.productId === productFilter) && normalizeSearch(display(product?.name)).includes(normalizeSearch(productSearch));
  });
  const productRows = kind === 'products' ? filterAdminProducts(rows, lookups.categories ?? [], categoryFilter, search) : [];
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (kind === "dashboard" || kind === "statistics") {
          const [d, products, sizes, recentOrders] = await Promise.all([
            getStore<NonNullable<typeof dashboard>>("/admin/dashboard"),
            getStore<OverviewProduct[]>('/admin/products'),
            getStore<OverviewSize[]>('/admin/sizes'),
            getStore<Order[]>('/admin/orders'),
          ]);
          if (active) { setDashboard(d); setOverviewDetails({ products, sizes, orders: recentOrders, now: Date.now() }); }
        } else if (kind === "orders") {
          const d = await getStore<Order[]>("/admin/orders");
          if (active) setOrders(d);
        } else {
          const d = await getStore<Row[]>(`/admin/${kind}`);
          const refs = await Promise.all(
            (fields[kind] || [])
              .filter((f) => f.source)
              .map(
                async (f) =>
                  [
                    f.source!,
                    await getStore<Row[]>(`/admin/${f.source}`),
                  ] as const,
              ),
          );
          if (kind === "categories") refs.push(["products", await getStore<Row[]>("/admin/products")]);
          if (active) {
            setRows(d);
            setLookups(Object.fromEntries(refs));
          }
        }
        if (active) setError("");
      } catch (e) {
        if (active) setError(authError(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [kind, attempt]);
  function edit(row: Row | null) {
    setImageFile(null);
    setFormError('');
    setSelected(row);
    const next: Record<string, string | boolean> = {};
    for (const f of fields[kind] || []) {
      const value = row?.[f.key];
      if (f.type === "checkbox") next[f.key] = row ? value === true : true;
      else if (f.type === "datetime-local" && typeof value === "string") {
        const d = new Date(value);
        next[f.key] = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      } else
        next[f.key] = value == null ? (kind === "sizes" && f.key === "extraPrice" ? "0" : f.options?.[0] || "") : display(value);
    }
    setForm(next);
    setEditing(true);
  }
  async function save(event: Pick<React.FormEvent, 'preventDefault'>, confirmed = false) {
    event.preventDefault();
    if (!confirmed && selected?.isActive === true && form.isActive === false) {
      if (kind === 'users') {
        setFormConfirmation({ title: `Khóa tài khoản ${selected.email}?`, description: 'Người này sẽ không đăng nhập được nữa. Bạn có thể mở khóa lại bất cứ lúc nào.', action: 'Khóa tài khoản' }); return;
      }
      const count = (lookups.products ?? []).filter((product) => product.categoryId === selected.id).length;
      if (kind === 'categories' && count > 0) {
        setFormConfirmation({ title: `Tắt danh mục ${selected.name}?`, description: `Danh mục có ${count} món. Các món này sẽ ẩn khỏi thực đơn của khách.`, action: 'Tắt danh mục' }); return;
      }
    }
    setFormConfirmation(null);
    setPending(true);
    setError("");
    setFormError('');
    const body: Record<string, unknown> = { ...form };
    if (kind === "promotions") {
      body.usageLimit = Number(form.usageLimit);
      body.startDate = new Date(String(form.startDate)).toISOString();
      body.endDate = new Date(String(form.endDate)).toISOString();
    }
    try {
      if (kind === 'products' && imageFile) {
        const multipart = new FormData(); multipart.append('file', imageFile);
        const result = await authHttp.post<{ path: string }>(apiUrl('/admin/product-images'), multipart);
        body.imageUrl = new URL(result.data.path, apiUrl('/')).toString();
      }
      await sendStore(
        `/admin/${kind}${selected ? `/${selected.id}` : ""}`,
        body,
        selected ? "patch" : "post",
      );
      setEditing(false);
      setAttempt((a) => a + 1);
    } catch (e) {
      setFormError(authError(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <SiteFrame>
      <section className="section admin-shell-section">
        <div className="container store-workspace admin-workspace admin-shell">
          <AdminSidebar current={kind} onNavigate={navigate} />
          <div ref={workspaceRef} className="admin-main-panel" style={loading && loadingHeight ? { minHeight: `max(calc(100svh - 180px), ${loadingHeight}px)` } : undefined}>
          <header className="admin-page-heading"><h1>{names[kind]}</h1><button className="admin-refresh" aria-label="Làm mới" title="Làm mới" disabled={loading} onClick={() => { setLoadingHeight(workspaceRef.current?.getBoundingClientRect().height ?? 0); setLoading(true); setAttempt((value) => value + 1); }}>↻</button></header>
          {loading && (
            <p role="status">Đang tải dữ liệu và kiểm tra quyền ADMIN…</p>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button onClick={() => setAttempt((a) => a + 1)}>Thử lại</button>
            </p>
          )}
          {!loading && !error && (kind === "dashboard" || kind === "statistics") && dashboard && (
            <AdminOverview data={dashboard} {...overviewDetails} onNavigate={navigate} mode={kind === "statistics" ? "statistics" : "summary"} />
          )}
          {!loading && !error && fields[kind] && (
            <>
              {kind === "promotions" && <PromotionsTable rows={rows} onEdit={edit} onRefresh={() => setAttempt((value) => value + 1)} />}
              {['categories', 'toppings', 'users'].includes(kind) && <CatalogManagement key={kind} kind={kind as 'categories' | 'toppings' | 'users'} rows={rows} products={lookups.products ?? []} onEdit={edit} onRefresh={() => setAttempt((value) => value + 1)} />}
              {kind === 'products' && <div className="admin-search-bar">
                <button className="admin-add-button" onClick={() => edit(null)}>Thêm mới</button>
                <div className="admin-search-field">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
                  <input id="admin-list-search" type="search" aria-label="Tìm sản phẩm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm sản phẩm" />
                </div>
                <button type="button" aria-label="Làm mới dữ liệu" title="Làm mới" onClick={() => { setLoadingHeight(workspaceRef.current?.getBoundingClientRect().height ?? 0); setLoading(true); setAttempt((value) => value + 1); }}>↻</button>
                <p role="status">{productRows.length} / {rows.length} kết quả</p>
              </div>}
              {kind === 'products' && <ProductCategoryFilter categories={lookups.categories ?? []} value={categoryFilter} onChange={setCategoryFilter} />}
              {['products', 'sizes'].includes(kind) && !rows.length && <p>Chưa có dữ liệu.</p>}
              {['products', 'sizes'].includes(kind) && rows.length > 0 && (kind === 'products' ? productRows : filteredRows).length === 0 && <p role="status">Không tìm thấy kết quả phù hợp.</p>}
              {kind === "sizes" && <>
              <div className="store-actions inventory-filters">
                <button className="admin-add-button" onClick={() => edit(null)}>+ Thêm size</button>
                <div className="admin-search-field">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
                  <input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm sản phẩm" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
                </div>
                <button aria-label="Làm mới tồn kho" title="Làm mới tồn kho" onClick={() => { setLoadingHeight(workspaceRef.current?.getBoundingClientRect().height ?? 0); setLoading(true); setAttempt((value) => value + 1); }}>↻</button>
                <p className="admin-search-count" role="status">Hiển thị {filteredRows.length} trên {rows.length} size</p>
                <select aria-label="Lọc sản phẩm" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">Tất cả sản phẩm</option>{lookups.products?.map((product) => <option key={product.id} value={product.id}>{display(product.name)}</option>)}</select>
              </div>
              <InventoryTable rows={filteredRows} products={lookups.products ?? []} onEdit={edit} onSaved={() => setAttempt((value) => value + 1)} />
              </>}
              {kind === "products" && <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>{primaryLabels[kind]}</th>
                      {fields[kind]
                        .filter(
                          (f) =>
                            !["name", "description", "imageUrl"].includes(
                              f.key,
                            ),
                        )
                        .map((f) => (
                          <th key={f.key}>{f.label}</th>
                        ))}
                      <th>Chỉnh sửa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((r) => (
                      <tr key={r.id}>
                        <td>{display(r.name || r.email || r.code)}</td>
                        {fields[kind]
                          .filter(
                            (f) =>
                              !["name", "description", "imageUrl"].includes(
                                f.key,
                              ),
                          )
                          .map((f) => (
                            <td key={f.key}>
                              {f.source
                                ? display(
                                    lookups[f.source]?.find(
                                      (v) => v.id === r[f.key],
                                    )?.name,
                                  )
                                : ['basePrice', 'extraPrice', 'price', 'minOrderValue', 'maxDiscount'].includes(f.key) && r[f.key] != null ? `${formatPrice(String(r[f.key]))}đ` : f.key === 'isAvailable' ? <ProductAvailability id={r.id} name={String(r.name)} available={r.isAvailable === true} onRefresh={() => setAttempt((value) => value + 1)} /> : display(r[f.key])}
                            </td>
                          ))}
                        <td>
                          <button
                            className="inventory-icon-button"
                            aria-label={`Sửa ${String(r.name)}`}
                            onClick={() => edit(r)}
                          >
                            <Pencil />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </>
          )}
          {editing && (
            <CenteredDialog label={`${selected ? 'Sửa' : 'Thêm'} ${names[kind].toLocaleLowerCase('vi-VN')}`} className="admin-edit-dialog" onClose={() => { if (!pending) setEditing(false); }}>
            <form className="admin-form" onSubmit={save}>
              <button type="button" className="admin-edit-close" aria-label="Đóng form" disabled={pending} onClick={() => setEditing(false)}>×</button>
              <h2>
                {selected ? "Cập nhật" : "Thêm"} {kind === "sizes" ? "size" : names[kind]}
              </h2>
              {(fields[kind] || []).map((f) => (
                kind === 'products' && f.key === 'imageUrl' ? <ProductImagePicker key={f.key} current={String(form.imageUrl ?? '')} file={imageFile} disabled={pending} onChange={setImageFile} /> : <label key={f.key}>
                  {f.label}
                  {f.source || f.options ? (
                    <select
                      value={String(form[f.key] || "")}
                      onChange={(e) =>
                        setForm({ ...form, [f.key]: e.target.value })
                      }
                      required
                    >
                      <option value="">Chọn…</option>
                      {f.source
                        ? (lookups[f.source] || []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {display(r.name)}
                            </option>
                          ))
                        : f.options?.map((v) => <option key={v}>{v}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      value={String(form[f.key] || "")}
                      onChange={(e) =>
                        setForm({ ...form, [f.key]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      type={f.type || "text"}
                      min={f.type === "number" ? 0 : undefined}
                      step={f.type === "number" ? 1 : undefined}
                      checked={
                        f.type === "checkbox" ? form[f.key] === true : undefined
                      }
                      value={
                        f.type === "checkbox"
                          ? undefined
                          : String(form[f.key] ?? "")
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [f.key]:
                            f.type === "checkbox"
                              ? e.target.checked
                              : e.target.value,
                        })
                      }
                      required={
                        !["description", "imageUrl", "maxDiscount"].includes(
                          f.key,
                        ) && f.type !== "checkbox"
                      }
                    />
                  )}
                  {kind === "sizes" && f.key === "extraPrice" && <small className="size-price-help">Giá cố định cộng vào giá cơ bản khi chọn size này. Nhập 0 nếu không phụ phí.</small>}
                </label>
              ))}
              {formError && <p role="alert">{formError}</p>}
              <div className="store-actions">
                <button disabled={pending}>Lưu</button>
                <button type="button" disabled={pending} onClick={() => setEditing(false)}>
                  Hủy
                </button>
              </div>
            </form>
            </CenteredDialog>
          )}
          {!loading && !error && kind === "orders" && (
            <OrderMonitor orders={orders} />
          )}
          {formConfirmation && <CenteredDialog label={formConfirmation.title} className="admin-confirm-dialog" onClose={() => setFormConfirmation(null)}><h2>{formConfirmation.title}</h2><p>{formConfirmation.description}</p><div className="store-actions"><button onClick={() => setFormConfirmation(null)}>Hủy</button><button onClick={() => void save({ preventDefault() {} }, true)}>{formConfirmation.action}</button></div></CenteredDialog>}
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
