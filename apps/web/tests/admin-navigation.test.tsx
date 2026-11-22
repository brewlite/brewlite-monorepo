import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "../components/admin/admin-sidebar";
import { OrderMonitor } from "../components/admin/order-monitor";
import type { Order } from "../services/store.service";
afterEach(cleanup);
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
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
  const order: Order = { id: "one", orderCode: "BL001", status: "CANCELLED", version: 1, finalTotal: "45000", subtotal: "50000", discountAmount: "5000", pointsDiscount: "0", pointsUsed: 10, couponCodeSnapshot: "WELCOME", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, items: [{ id: "item", productName: "Cà phê", sizeName: "Size L", unitPrice: "40000", quantity: 1, note: "Ít đá", lineTotal: "45000", toppings: [{ toppingName: "Trân châu", price: "5000" }] }], payments: [{ id: "payment", method: "CARD", status: "FAILED", amount: "45000", createdAt: "2026-11-08T00:02:00Z", attemptNumber: 1 }], history: [{ fromStatus: null, toStatus: "PENDING", actorId: "admin-1", createdAt: "2026-11-08T00:00:00Z" }, { fromStatus: "PENDING", toStatus: "CANCELLED", actorId: "admin-1", createdAt: "2026-11-08T00:01:00Z" }] };
  render(<OrderMonitor orders={[order]} />);
  const trigger = screen.getByRole("row", { name: "Chi tiết đơn BL001" });
  expect(screen.queryByRole("columnheader", { name: "Chi tiết" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Chi tiết đơn BL001" })).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Chi tiết đơn BL001" })).toBeDefined();
  expect(screen.getByText("Ghi chú: Ít đá")).toBeDefined();
  expect(screen.getByText("Chi tiết đơn hàng")).toBeDefined();
  expect(screen.getByText("Size L · 1 ly")).toBeDefined();
  expect(screen.queryByText("Size Size L")).toBeNull();
  expect(screen.getByText("Topping: Trân châu (5.000đ)")).toBeDefined();
  expect(screen.getByText("Size L · 1 ly · Đơn giá: 40.000đ")).toBeDefined();
  expect(screen.getByText("Thành tiền: 45.000đ")).toBeDefined();
  expect(screen.getAllByText("08/11/2026 lúc 07:00:00")).toHaveLength(2);
  expect(screen.getByText("WELCOME")).toBeDefined();
  expect(screen.getByText("10 điểm")).toBeDefined();
  expect(screen.queryByText("Giảm bằng điểm")).toBeNull();
  expect(screen.getByText("Thẻ · Thất bại")).toBeDefined();
  expect(screen.queryByRole("button", { name: /^Đóng$/ })).toBeNull();
  expect(screen.queryByText("admin-1")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sao chép ID" })).toBeNull();
  expect(screen.getByText("Chờ thanh toán → Đã hủy")).toBeDefined();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Đóng chi tiết đơn hàng" }));
  expect(screen.queryByRole("dialog", { name: "Chi tiết đơn BL001" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent(screen.getByRole("dialog", { name: "Chi tiết đơn BL001" }), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog", { name: "Chi tiết đơn BL001" })).toBeNull();
  fireEvent.keyDown(trigger, { key: " " });
  expect(screen.getByRole("dialog", { name: "Chi tiết đơn BL001" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Đóng chi tiết đơn hàng" }));
  fireEvent.click(screen.getByRole("button", { name: "Đã thanh toán" }));
  expect(screen.queryByText("BL001")).toBeNull();
  expect(screen.getByText("Không có đơn phù hợp.")).toBeDefined();
});
it("keeps expanded Admin details readable with multiple items and missing optional data", () => {
  const order: Order = { id: "two", orderCode: "BL002", status: "PAID", version: 1, finalTotal: "60000", subtotal: "60000", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, items: [
    { id: "item-1", productName: "Latte", sizeName: null, unitPrice: "25000", quantity: 2, note: null, lineTotal: "50000", toppings: [] },
    { id: "item-2", productName: "Trà đào", sizeName: "M", unitPrice: null, quantity: 1, note: "Ít ngọt", lineTotal: "10000", toppings: [{ toppingName: "Thạch đào", price: "3000" }] },
  ], payments: [{ id: "success", method: "WALLET", status: "SUCCESS", amount: "60000", createdAt: "2026-11-08T00:03:00Z" }, { id: "failed", method: "CARD", status: "FAILED", amount: "60000", createdAt: "2026-11-08T00:02:00Z" }, { id: "fallback", method: "BANK_TRANSFER", status: "PROCESSING", amount: "60000" }], history: [] };
  render(<OrderMonitor orders={[order]} />);
  fireEvent.click(screen.getByRole("row", { name: "Chi tiết đơn BL002" }));
  expect(screen.getByRole("dialog", { name: "Chi tiết đơn BL002" })).toBeDefined();
  expect(screen.getByText("Chưa có size · 2 ly")).toBeDefined();
  expect(screen.queryByText("Topping: Không topping")).toBeNull();
  expect(screen.getByText("Ghi chú: Ít ngọt")).toBeDefined();
  expect(screen.getByText("Chưa có size · 2 ly · Đơn giá: 25.000đ")).toBeDefined();
  expect(screen.getByText("Size M · 1 ly · Đơn giá: —")).toBeDefined();
  expect(screen.getByText("Tạm tính")).toBeDefined();
  expect(screen.getByText("Ví điện tử · Thành công")).toBeDefined();
  expect(screen.getByText("Thẻ · Thất bại")).toBeDefined();
  expect(screen.getByText("BANK_TRANSFER · PROCESSING")).toBeDefined();
  expect(screen.queryByText("Chưa có giao dịch thanh toán.")).toBeNull();
  expect(screen.getByText("Chưa có lịch sử trạng thái.")).toBeDefined();
});
it("shows a compact message when an order has no payment transactions", () => {
  const order: Order = { id: "three", orderCode: "BL003", status: "PENDING", version: 1, finalTotal: "25000", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, items: [{ id: "item-3", productName: "Americano", sizeName: null, quantity: 1, note: null, lineTotal: "25000", toppings: [] }], payments: [], history: [] };
  render(<OrderMonitor orders={[order]} />);
  fireEvent.click(screen.getByRole("row", { name: "Chi tiết đơn BL003" }));
  expect(screen.getByRole("dialog", { name: "Chi tiết đơn BL003" })).toBeDefined();
  expect(screen.getByText("Chưa có giao dịch thanh toán.")).toBeDefined();
  expect(screen.queryByText("Tạm tính")).toBeNull();
  expect(screen.queryByText("Mã giảm giá")).toBeNull();
  expect(screen.queryByText("Điểm sử dụng")).toBeNull();
});

it("renders real customer fields and the latest recorded staff actor without inventing an assignment", () => {
  const order: Order = { id: "people", orderCode: "BL-PEOPLE", status: "COMPLETED", version: 3, finalTotal: "50000", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, user: { id: "customer-uuid", fullName: "Khách thử nghiệm", email: "customer@example.test" }, items: [], payments: [], history: [
    { toStatus: "PREPARING", createdAt: "2026-11-08T00:01:00Z", actor: { id: "staff-old", fullName: "Nhân viên trước", email: "old@example.test", role: "STAFF" } },
    { toStatus: "COMPLETED", createdAt: "2026-11-08T00:02:00Z", actor: { id: "staff-new", fullName: "Nhân viên sau", email: "new@example.test", role: "STAFF" } },
  ] };
  render(<OrderMonitor orders={[order]} />);
  fireEvent.click(screen.getByRole("row", { name: "Chi tiết đơn BL-PEOPLE" }));
  expect(screen.getByText("Khách thử nghiệm")).toBeDefined();
  expect(screen.getByText("customer@example.test")).toBeDefined();
  expect(screen.getByText("Người cập nhật gần nhất")).toBeDefined();
  expect(screen.getByText("ID: staff-new")).toBeDefined();
  expect(screen.queryByText("ID: staff-old")).toBeNull();
  expect(screen.queryByText("Nhân viên phụ trách")).toBeNull();
});
it("marks missing people data honestly instead of using example names or claiming an unknown actor is the system", () => {
  const order: Order = { id: "unknown", orderCode: "BL-UNKNOWN", status: "PENDING", version: 1, finalTotal: "0", createdAt: "2026-11-08T00:00:00Z", expiresAt: null, items: [], payments: [], history: [{ toStatus: "PENDING", actorId: "unresolved-user", createdAt: "2026-11-08T00:00:00Z" }] };
  render(<OrderMonitor orders={[order]} />);
  fireEvent.click(screen.getByRole("row", { name: "Chi tiết đơn BL-UNKNOWN" }));
  expect(screen.getByText("Chưa có thông tin khách hàng.")).toBeDefined();
  expect(screen.getByText("Chưa ghi nhận nhân viên hoặc quản trị viên cập nhật.")).toBeDefined();
  expect(screen.getByText("Bởi: Chưa có thông tin người thực hiện")).toBeDefined();
  expect(screen.queryByText("Bởi: Hệ thống")).toBeNull();
});
