import type { Product, Size } from "../types/product";

export function configurationIssue(product: Pick<Product, "isAvailable" | "category">, size: Size | null, quantity = 1): string | null {
  if (!product.isAvailable) return "Món đang ngừng bán";
  if (product.category?.isActive === false) return "Danh mục đang ngừng bán";
  if (!size) return "Vui lòng chọn Size";
  if (!size.isAvailable) return "Size đang ngừng bán";
  if (size.onHand === null) return "Size chưa được nhập tồn kho";
  const available = size.onHand - size.reserved;
  if (available <= 0) return "Hết hàng";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return "Số lượng phải là số nguyên từ 1 đến 20";
  if (available < quantity) return "Không đủ số lượng";
  return null;
}

export function isUninitializedCatalogProduct(product: Product): boolean {
  return (
    product.sizes.length > 0 &&
    product.sizes.every((size) => !size.isAvailable || size.onHand === null)
  );
}

export function productIssue(product: Product): string | null {
  if (!product.isAvailable) return "Món đang ngừng bán";
  if (product.category?.isActive === false) return "Danh mục đang ngừng bán";
  if (product.sizes.some((size) => configurationIssue(product, size) === null)) return null;
  if (!product.sizes.length) return "Vui lòng chọn Size";
  const selling = product.sizes.filter((size) => size.isAvailable);
  if (!selling.length) return "Size đang ngừng bán";
  if (selling.some((size) => size.onHand === null)) return "Size chưa được nhập tồn kho";
  return "Hết hàng";
}
