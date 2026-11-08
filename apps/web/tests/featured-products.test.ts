import { describe, expect, it } from "vitest";
import { getFeaturedProducts, getMenuHighlights, menuGroups } from "../lib/featured-products";
import { makeProduct } from "./product-fixture";

const products = menuGroups.map((group, index) => makeProduct({
  id: `product-${index}`, name: group.product,
  category: { id: `category-${index}`, name: group.name },
}));

describe("featured products from API", () => {
  it("selects one real product per category in editorial order", () => {
    const highlights = getMenuHighlights([...products].reverse());
    expect(highlights.map((group) => group.product.id)).toEqual(products.map((product) => product.id));
    expect(highlights.every((group) => group.description.length > 0)).toBe(true);
  });

  it("uses an available product in the same category without inventing missing products", () => {
    const alternative = { ...products[0], name: "Trà đào" };
    expect(getMenuHighlights([alternative])[0].product).toBe(alternative);
    expect(getMenuHighlights([{ ...alternative, isAvailable: false }])).toEqual([]);
    expect(getMenuHighlights([])).toEqual([]);
  });

  it("features rose lychee first and grape tea instead of dragon fruit or butterfly pea", () => {
    const grape = makeProduct({ id: "grape", name: "Trà Nho" });
    const strawberry = makeProduct({ id: "strawberry", name: "Trà Sữa Dâu" });
    const other = ["Trà Thanh Long", "Trà Sữa Hoa Đậu Biếc"].map((name) => makeProduct({ id: name, name }));
    const latte = makeProduct({ id: "latte", name: "Latte Hạnh Nhân" });
    expect(getFeaturedProducts([...other, strawberry, grape, latte, ...products]).map((product) => product.id))
      .toEqual([...products.slice(0, 3).map((product) => product.id), latte.id, grape.id, strawberry.id]);
  });
});
