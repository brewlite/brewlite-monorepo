import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogManagement } from "../components/admin/catalog-management";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../services/store.service", () => ({ sendStore: send }));
vi.mock("../lib/auth-store", () => ({ useAuthUser: () => ({ id: "self" }) }));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
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
