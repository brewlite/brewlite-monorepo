import { describe, expect, it } from "vitest";
import { configurationIssue, isUninitializedCatalogProduct, productIssue } from "../lib/product-availability";
import { makeProduct } from "./product-fixture";

describe("catalog availability never uses legacy Product stock", () => {
  const product = makeProduct();
  const size = { id: "size", productId: product.id, name: "M", extraPrice: "0", onHand: 5, reserved: 2, isAvailable: true, version: 0, availableQuantity: 3, inventoryStatus: "AVAILABLE" as const };
  it("distinguishes every blocked configuration", () => {
    expect(configurationIssue({ ...product, isAvailable: false }, size)).toBe("Món đang ngừng bán");
    expect(configurationIssue({ ...product, category: { id: "c", name: "Tea", isActive: false } }, size)).toBe("Danh mục đang ngừng bán");
    expect(configurationIssue(product, null)).toBe("Vui lòng chọn Size");
    expect(configurationIssue(product, { ...size, isAvailable: false })).toBe("Size đang ngừng bán");
    expect(configurationIssue(product, { ...size, onHand: null })).toBe("Size chưa được nhập tồn kho");
    expect(configurationIssue(product, { ...size, onHand: 2 })).toBe("Hết hàng");
    expect(configurationIssue(product, size, 4)).toBe("Không đủ số lượng");
    expect(configurationIssue(product, size, 3)).toBeNull();
    expect(configurationIssue(product, size, 21)).toContain("1 đến 20");
  });
  it("card stays viewable but reports uninitialized, stopped, or sold out accurately", () => {
    expect(productIssue({ ...product, stockQuantity: 999, sizes: [{ ...size, onHand: null }] })).toBe("Size chưa được nhập tồn kho");
    expect(productIssue({ ...product, sizes: [{ ...size, isAvailable: false }] })).toBe("Size đang ngừng bán");
    expect(productIssue({ ...product, sizes: [{ ...size, onHand: 2 }] })).toBe("Hết hàng");
    expect(productIssue({ ...product, sizes: [size] })).toBeNull();
  });

  it("identifies products whose active sizes have no initialized inventory so customer menus can hide them", () => {
    expect(isUninitializedCatalogProduct({ ...product, sizes: [{ ...size, onHand: null }] })).toBe(true);
    expect(isUninitializedCatalogProduct({ ...product, sizes: [{ ...size, isAvailable: false }] })).toBe(true);
    expect(isUninitializedCatalogProduct({ ...product, sizes: [{ ...size, onHand: null }, size] })).toBe(false);
    expect(isUninitializedCatalogProduct({ ...product, sizes: [{ ...size, onHand: 0, reserved: 0 }] })).toBe(false);
  });
});
