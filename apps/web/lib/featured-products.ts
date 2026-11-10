import type { Product } from "../types/product";
import { normalizeSearch } from "./normalize-search";

export const menuGroups = [
  { name: "Trà trái cây", product: "Trà Vải Hoa Hồng", description: "Tươi mát từ trà và trái cây, mang đến cảm giác thanh nhẹ, sảng khoái." },
  { name: "Đá xay & Matcha", product: "Matcha Đá Xay Kem Tuyết", description: "Mát lạnh, mềm mịn, kết hợp hương matcha đặc trưng đầy cuốn hút." },
  { name: "Trà sữa", product: "Trà Sữa Ô Long Nướng", description: "Vị trà thơm hòa quyện cùng sữa béo mịn, ngọt ngào trong từng ngụm." },
  { name: "Cà phê", product: "Cà phê sữa đá", description: "Hương vị cà phê đậm đà, thơm nồng, đánh thức năng lượng cho mỗi ngày." },
];

export function getMenuHighlights(products: Product[]) {
  return menuGroups.flatMap((group) => {
    const candidates = products.filter((product) => product.isAvailable &&
      normalizeSearch(product.category?.name ?? "") === normalizeSearch(group.name));
    const product = candidates.find((item) => normalizeSearch(item.name) === normalizeSearch(group.product)) ?? candidates[0];
    return product ? [{ ...group, product }] : [];
  });
}

export function getFeaturedProducts(products: Product[]) {
  const available = products.filter((product) => product.isAvailable);
  const names = ["Trà Vải Hoa Hồng", "Matcha Đá Xay Kem Tuyết", "Trà Sữa Ô Long Nướng", "Latte Hạnh Nhân", "Trà Nho", "Trà Sữa Dâu"];
  const preferred = names.flatMap((name) => {
    const product = available.find((item) => normalizeSearch(item.name) === normalizeSearch(name));
    return product ? [product] : [];
  });
  const selected = new Set(preferred.map((product) => product.id));
  return [...preferred, ...available.filter((product) => !selected.has(product.id))].slice(0, 6);
}
