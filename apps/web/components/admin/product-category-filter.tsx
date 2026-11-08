import { normalizeSearch } from "../../lib/normalize-search";
type Row = Record<string, unknown> & { id: string };
export function filterAdminProducts(products: Row[], categories: Row[], categoryId: string, query: string) {
  const selected = categories.some((category) => category.id === categoryId && category.isActive === true) ? categoryId : "";
  return products.filter((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    const text = [product.name, product.description, category?.name].filter((value) => typeof value === "string").join(" ");
    return (!selected || product.categoryId === selected) && normalizeSearch(text).includes(normalizeSearch(query));
  });
}
export function ProductCategoryFilter({ categories, value, onChange }: { categories: Row[]; value: string; onChange: (id: string) => void }) {
  const active = categories.filter((category) => category.isActive === true);
  const selected = active.some((category) => category.id === value) ? value : "";
  return <div className="account-role-filters product-category-filters" role="group" aria-label="Lọc sản phẩm theo danh mục">
    <button type="button" aria-pressed={!selected} onClick={() => onChange("")}>Tất cả</button>
    {active.map((category) => <button type="button" key={category.id} aria-pressed={selected === category.id} onClick={() => onChange(category.id)}>{String(category.name)}</button>)}
  </div>;
}
