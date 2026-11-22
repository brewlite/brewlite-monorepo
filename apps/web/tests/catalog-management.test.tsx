import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogManagement } from "../components/admin/catalog-management";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
const { getStore } = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock("../services/store.service", () => ({ sendStore: send, getStore }));
vi.mock("../lib/auth-store", () => ({ useAuthUser: () => ({ id: "self" }) }));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
beforeEach(() => { getStore.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("counts all products by category including hidden products", () => {
  render(<CatalogManagement kind="categories" rows={[{ id: "coffee", name: "Cà phê", isActive: true }]} products={[{ id: "one", categoryId: "coffee", isAvailable: false }, { id: "two", categoryId: "coffee" }, { id: "other", categoryId: "tea" }]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByText("2 món")).toBeDefined();
});
it("filters accounts by role and protects ADMIN controls", () => {
  const users = [{ id: "owner", email: "owner@example.test", role: "ADMIN", isActive: true }, { id: "customer", email: "customer@example.test", role: "CUSTOMER", isActive: true }];
  render(<CatalogManagement kind="users" rows={users} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByRole("switch", { name: "Hoạt động owner@example.test" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Sửa owner@example.test" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "Quản lý" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Khách hàng" }));
  expect(screen.queryByText("owner@example.test")).toBeNull();
  expect(screen.getByText("customer@example.test")).toBeDefined();
});
it("toggles only the topping selling flag through the API", async () => {
  send.mockResolvedValue({}); const refresh = vi.fn();
  render(<CatalogManagement kind="toppings" rows={[{ id: "pearl", name: "Trân châu", price: "5000", isAvailable: true }]} products={[]} onEdit={vi.fn()} onRefresh={refresh} />);
  fireEvent.click(screen.getByRole("switch", { name: "Áp dụng Trân châu" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledWith("/admin/toppings/pearl", { isAvailable: false }, "patch");
});
it("confirms the consequences before disabling a nonempty category", async () => {
  send.mockResolvedValue({});
  render(<CatalogManagement kind="categories" rows={[{ id: "coffee", name: "Cà phê", isActive: true }]} products={[{ id: "one", categoryId: "coffee" }]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("switch", { name: "Áp dụng Cà phê" }));
  expect(screen.getByText("Danh mục có 1 món. Các món này sẽ ẩn khỏi thực đơn của khách.")).toBeDefined();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "Áp dụng Cà phê" }));
  fireEvent.click(screen.getByRole("button", { name: "Tắt danh mục" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith("/admin/categories/coffee", { isActive: false }, "patch"));
});
it("disables empty categories immediately and offers undo", async () => {
  send.mockResolvedValue({});
  render(<CatalogManagement kind="categories" rows={[{ id: "empty", name: "Trống", isActive: true }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByRole("button", { name: "Hoàn tác" });
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
  await waitFor(() => expect(send).toHaveBeenLastCalledWith("/admin/categories/empty", { isActive: true }, "patch"));
});
it("protects the current account and confirms locking other accounts", () => {
  render(<CatalogManagement kind="users" rows={[{ id: "self", email: "self@example.test", role: "STAFF", isActive: true }, { id: "other", email: "other@example.test", role: "CUSTOMER", isActive: true }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByRole("switch", { name: "Hoạt động self@example.test" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("switch", { name: "Hoạt động other@example.test" }));
  expect(screen.getByRole("dialog", { name: "Khóa tài khoản other@example.test?" })).toBeDefined();
  expect(send).not.toHaveBeenCalled();
});
it("cancels account locking without sending an update, then saves only after confirmation", async () => {
  send.mockResolvedValue({}); const refresh = vi.fn();
  render(<CatalogManagement kind="users" rows={[{ id: "other", email: "other@example.test", role: "CUSTOMER", isActive: true }]} products={[]} onEdit={vi.fn()} onRefresh={refresh} />);
  const toggle = screen.getByRole("switch");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Khóa tài khoản" }));
  await screen.findByText("Đã khóa tài khoản other@example.test.");
  expect(send).toHaveBeenCalledWith("/admin/users/other", { isActive: false }, "patch");
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("unlocks immediately but asks again when locking the same account", async () => {
  send.mockResolvedValue({});
  render(<CatalogManagement kind="users" rows={[{ id: "other", email: "other@example.test", role: "CUSTOMER", isActive: false }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByText("Đã mở khóa tài khoản other@example.test.");
  expect(send).toHaveBeenCalledWith("/admin/users/other", { isActive: true }, "patch");
  fireEvent.click(screen.getByRole("switch"));
  expect(screen.getByRole("dialog", { name: "Khóa tài khoản other@example.test?" })).toBeDefined();
  expect(send).toHaveBeenCalledTimes(1);
});
it("shows customer details and loads order statistics", async () => {
  getStore
    .mockResolvedValueOnce({ totalOrders: 4, completedOrders: 2, cancelledOrders: 1 })
    .mockResolvedValueOnce({ items: [{ id: "order-1", orderCode: "BL-001", status: "COMPLETED", finalTotal: "85000", createdAt: "2026-11-13T08:00:00.000Z" }], page: 1, pageSize: 5, total: 1, totalPages: 1 })
    .mockResolvedValueOnce({ id: "order-1", orderCode: "BL-001", status: "COMPLETED", finalTotal: "85000", createdAt: "2026-11-13T08:00:00.000Z", version: 1, expiresAt: null, items: [], payments: [], history: [] });
  render(<CatalogManagement kind="users" rows={[{ id: "customer", fullName: "Khách hàng", email: "customer@example.test", role: "CUSTOMER", isActive: true, emailVerifiedAt: "2026-11-13T00:00:00.000Z", loyaltyPoints: 25 }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết customer@example.test" }));
  expect(screen.getByRole("dialog", { name: "Chi tiết khách hàng" })).toBeDefined();
  expect(screen.getAllByText("Khách hàng").length).toBeGreaterThan(0);
  expect(screen.getByText("25 điểm")).toBeDefined();
  await screen.findByText("Tổng đơn hàng");
  expect(screen.getByText("4")).toBeDefined();
  expect(getStore).toHaveBeenCalledWith("/admin/users/customer/order-stats");
  expect(screen.getByText("Đơn hàng gần đây")).toBeDefined();
  expect(await screen.findByText("BL-001")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết đơn BL-001" }));
  expect(screen.getByRole("dialog", { name: "Chi tiết đơn hàng" })).toBeDefined();
  expect(await screen.findByRole("heading", { name: "Lịch sử trạng thái" })).toBeDefined();
  expect(screen.queryByText("Tóm tắt đơn hàng")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  expect(screen.getByRole("dialog", { name: "Chi tiết khách hàng" })).toBeDefined();
  expect(screen.getAllByRole("button", { name: "Đóng chi tiết tài khoản" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Đóng chi tiết tài khoản" }));
  expect(screen.queryByRole("dialog", { name: "Chi tiết khách hàng" })).toBeNull();
});
it("loads staff activity without treating staff as a customer", async () => {
  getStore.mockResolvedValueOnce({ participatedOrders: 0, totalUpdates: 0, transitions: [], recentEvents: [] });
  render(<CatalogManagement kind="users" rows={[{ id: "staff", fullName: "Nhân viên", email: "staff@example.test", role: "STAFF", isActive: false, emailVerifiedAt: null, loyaltyPoints: 99 }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết staff@example.test" }));
  expect(screen.getByText("Chưa xác minh")).toBeDefined();
  expect(screen.queryByText("Điểm thưởng")).toBeNull();
  expect(screen.queryByText("Đơn hàng gần đây")).toBeNull();
  expect(await screen.findByText("Chưa có hoạt động xử lý đơn.")).toBeDefined();
  expect(getStore).toHaveBeenCalledWith("/admin/users/staff/activity");
  expect(getStore).not.toHaveBeenCalledWith("/admin/users/staff/order-stats");
});
it("shows a retryable error instead of zero statistics", async () => {
  getStore.mockRejectedValue(new Error("request failed"));
  render(<CatalogManagement kind="users" rows={[{ id: "customer", email: "customer@example.test", role: "CUSTOMER", isActive: true, loyaltyPoints: 0 }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.queryByText("Chi tiết")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết customer@example.test" }));
  await screen.findByText("Không thể tải thống kê đơn hàng");
  expect(screen.queryByText("Tổng đơn hàng")).toBeNull();
  expect(screen.getAllByRole("button", { name: "Thử lại" })).toHaveLength(2);
});
it("filters account orders and loads the next page without opening another dialog", async () => {
  const order = (id: string, code: string, status = "COMPLETED") => ({ id, orderCode: code, status, finalTotal: "85000", createdAt: "2026-11-13T08:00:00.000Z" });
  getStore
    .mockResolvedValueOnce({ totalOrders: 11, completedOrders: 2, cancelledOrders: 1 })
    .mockResolvedValueOnce({ items: [order("preview", "BL-PREVIEW")], page: 1, pageSize: 5, total: 11, totalPages: 3 })
    .mockResolvedValueOnce({ items: [order("page-one", "BL-001")], page: 1, pageSize: 10, total: 2, totalPages: 2 })
    .mockResolvedValueOnce({ items: [order("page-one", "BL-001")], page: 1, pageSize: 10, total: 2, totalPages: 2 })
    .mockResolvedValueOnce({ items: [order("page-two", "BL-002", "CANCELLED")], page: 2, pageSize: 10, total: 2, totalPages: 2 });
  render(<CatalogManagement kind="users" rows={[{ id: "customer", fullName: "Khách hàng", email: "customer@example.test", role: "CUSTOMER", isActive: true }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết customer@example.test" }));
  await screen.findByText("BL-PREVIEW");
  fireEvent.click(screen.getByRole("button", { name: /^Xem tất cả/ }));
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tất" }));
  await screen.findByText("BL-001");
  fireEvent.click(screen.getByRole("button", { name: "Tải thêm 10 đơn" }));
  await screen.findByText("BL-002");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

it("opens different complete orders and returns to the same filtered list", async () => {
  const rows = ["A", "B"].map((code) => ({ id: code, orderCode: `BL-${code}`, status: "COMPLETED", finalTotal: "35000", createdAt: "2026-11-13T08:00:00Z" }));
  getStore.mockImplementation((url: string) => Promise.resolve(url.endsWith("order-stats") ? { totalOrders: 2, completedOrders: 2, cancelledOrders: 0 } : url.startsWith("/admin/users/") ? { items: rows, page: 1, pageSize: 10, total: 2, totalPages: 1 } : { ...rows.find((row) => url.endsWith(`/${row.id}`)), version: 1, expiresAt: null, items: [{ id: "item", productName: url.endsWith("/A") ? "Thức uống A" : "Thức uống B", sizeName: "M", quantity: 1, lineTotal: "35000", toppings: [] }], payments: [], history: [] }));
  render(<CatalogManagement kind="users" rows={[{ id: "customer", email: "customer@example.test", role: "CUSTOMER", isActive: true }]} products={[]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết customer@example.test" }));
  await screen.findByRole("button", { name: /^Xem tất cả 2 đơn$/ });
  fireEvent.click(screen.getByRole("button", { name: /^Xem tất cả/ }));
  fireEvent.click(screen.getByRole("button", { name: "Hoàn tất" }));
  fireEvent.click(await screen.findByRole("button", { name: "Xem chi tiết đơn BL-B" }));
  expect(await screen.findByText("Thức uống B")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Thanh toán" })).toBeDefined();
  expect(screen.queryByText("Tóm tắt đơn hàng")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  expect(screen.getByRole("button", { name: "Hoàn tất" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Xem chi tiết đơn BL-A" }));
  expect(await screen.findByText("Thức uống A")).toBeDefined();
  expect(screen.queryByText("Thức uống B")).toBeNull();
  expect(getStore).toHaveBeenCalledWith("/admin/orders/A");
  expect(getStore).toHaveBeenCalledWith("/admin/orders/B");
  fireEvent.click(screen.getByRole("button", { name: "Đóng chi tiết đơn hàng" }));
  expect(screen.queryByRole("dialog", { name: "Chi tiết đơn hàng" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Chi tiết khách hàng" })).toBeNull();
});
