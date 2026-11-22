"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecommendedProducts } from "../../services/product.service";
import type { Product } from "../../types/product";
import { isUninitializedCatalogProduct, productIssue } from "../../lib/product-availability";
import { ProductList } from "../menu/product-list";

export function EmptyCart() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getRecommendedProducts().then((items) => {
      if (!active) return;
      setProducts(items.filter((item) => item.isAvailable && item.category?.isActive !== false && !isUninitializedCatalogProduct(item)).sort((a, b) => Number(productIssue(a) !== null) - Number(productIssue(b) !== null)).slice(0, 4));
      setError(false);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="cart-empty-state">
    <div className="cart-empty-intro">
      <svg className="cart-cup" viewBox="0 0 180 160" fill="none" aria-hidden="true">
        <ellipse cx="87" cy="144" rx="59" ry="7" fill="#f0f0f0" />
        <g stroke="#bdbdbd" strokeWidth="2.5" strokeLinecap="round"><path d="M66 39c-13-12 8-15 0-27" /><path d="M87 36c-13-12 8-15 0-27" /><path d="M108 39c-13-12 8-15 0-27" /></g>
        <path d="M135 73h9c27 0 27 31 0 31h-9" fill="#fff" stroke="#111" strokeWidth="3.5" />
        <path d="M39 60h96v42c0 26-17 37-47 37s-49-11-49-37V60Z" fill="#fff" stroke="#111" strokeWidth="3.5" />
        <path d="M40 67h94" stroke="#111" strokeWidth="3.5" />
        <circle cx="60" cy="108" r="5" fill="#f3d5d5" /><circle cx="115" cy="108" r="5" fill="#f3d5d5" />
        <g className="cart-cup-eyes" fill="#111"><circle cx="73" cy="98" r="4" /><circle cx="103" cy="98" r="4" /></g>
        <path d="M80 109q8 8 16 0" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <h2>Giỏ hàng đang chờ món đầu tiên</h2>
      <p>Chưa có gì ở đây cả. Chọn một ly để bắt đầu nhé.</p>
      <Link className="cart-empty-menu" href="/menu">Xem thực đơn</Link>
    </div>
    <section className="cart-recommendations" aria-label="Gợi ý cho bạn">
      <h2>Gợi ý cho bạn</h2>
      {loading && <p role="status">Đang tìm món cho bạn…</p>}
      {!loading && error && <p role="status">Chưa tải được món gợi ý. <button type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Thử lại</button></p>}
      {!loading && !error && products.length > 0 && <ProductList products={products} />}
      {!loading && !error && products.length === 0 && <p>Hiện chưa có món gợi ý. Bạn có thể quay lại thực đơn sau nhé.</p>}
    </section>
  </div>;
}
