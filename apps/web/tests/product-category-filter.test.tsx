import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { filterAdminProducts, ProductCategoryFilter } from "../components/admin/product-category-filter";
afterEach(cleanup);
const categories = [{ id: "coffee", name: "Cà phê", isActive: true }, { id: "tea", name: "Trà", isActive: true }, { id: "hidden", name: "Ngưng dùng", isActive: false }];
const products = [{ id: "one", name: "Latte Hạnh Nhân", categoryId: "coffee" }, { id: "two", name: "Latte trà", categoryId: "tea" }, { id: "three", name: "Espresso", categoryId: "coffee" }];
it("combines the category ID with accent-insensitive search and defaults to all", () => {
  expect(filterAdminProducts(products, categories, "", "")).toHaveLength(3);
  expect(filterAdminProducts(products, categories, "coffee", "LATTE").map((product) => product.id)).toEqual(["one"]);
  expect(filterAdminProducts(products, categories, "coffee", "hanh nhan")).toHaveLength(1);
  expect(filterAdminProducts(products, categories, "coffee", "missing")).toHaveLength(0);
});
it("renders real active categories including newly added ones", () => {
  const change = vi.fn();
  render(<ProductCategoryFilter categories={[...categories, { id: "new", name: "Sinh tố", isActive: true }]} value="" onChange={change} />);
  expect(screen.getByRole("button", { name: "Tất cả" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Ngưng dùng" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sinh tố" }));
  expect(change).toHaveBeenCalledWith("new");
});
it("falls back to all when the selected category is deactivated", () => {
  expect(filterAdminProducts(products, categories, "hidden", "latte")).toHaveLength(2);
});
