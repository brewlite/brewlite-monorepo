import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "../components/admin/admin-sidebar";
import { OrderMonitor } from "../components/admin/order-monitor";
import type { Order } from "../services/store.service";
afterEach(cleanup);
it("keeps all administration destinations available and marks the active section", () => {
  const navigate = vi.fn();
  render(<AdminSidebar current="dashboard" onNavigate={navigate} />);
  expect(screen.getByRole("button", { name: "Tổng quan" }).getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: "Giám sát đơn" }));
  expect(navigate).toHaveBeenCalledWith("orders");
  expect(screen.getByRole("button", { name: "Thống kê" })).toBeDefined();
  expect(screen.getByRole("link", { name: "← Về cửa hàng" }).getAttribute("href")).toBe("/");
});
it("filters actual order statuses and expands snapshots without a mutation action", () => {
  const order: Order = { id: "one", orderCode: "BL001", status: "CANCELLED", version: 1, finalTotal: "45000", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, items: [{ id: "item", productName: "Cà phê", sizeName: "L", quantity: 1, note: "Ít đá", lineTotal: "45000", toppings: [] }], payments: [], history: [{ toStatus: "PENDING_PAYMENT", createdAt: "2026-11-08T00:00:00Z" }, { toStatus: "CANCELLED", createdAt: "2026-11-08T00:01:00Z" }] };
  render(<OrderMonitor orders={[order]} />);
  fireEvent.click(screen.getByRole("button", { name: "Chi tiết đơn BL001" }));
  expect(screen.getByText("Ít đá")).toBeDefined();
  expect(screen.getByText("Chờ thanh toán → Đã hủy")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Đã thanh toán" }));
  expect(screen.queryByText("BL001")).toBeNull();
  expect(screen.getByText("Không có đơn phù hợp.")).toBeDefined();
});
