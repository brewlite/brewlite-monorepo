import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  ready: false,
  error: null as string | null,
  user: null as { id: string; role: "CUSTOMER" | "STAFF" | "ADMIN" } | null,
  refresh: vi.fn(),
}));
const getStore = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth-store", () => ({
  useAuthStatus: () => ({ ready: authState.ready, error: authState.error }),
  useAuthUser: () => authState.user,
  refreshAuth: authState.refresh,
}));
vi.mock("../services/store.service", () => ({ getStore, sendStore: vi.fn() }));
vi.mock("../services/auth.service", () => ({
  authError: () => "Không thể tải dữ liệu.",
  authHttp: { post: vi.fn() },
}));
vi.mock("../services/product.service", () => ({ apiUrl: (path: string) => path }));
vi.mock("../components/layout/site-frame", () => ({ SiteFrame: ({ children }: { children: unknown }) => <>{children}</> }));
vi.mock("../components/ui/centered-dialog", () => ({ CenteredDialog: ({ children }: { children: unknown }) => <>{children}</> }));
vi.mock("../components/admin/admin-sidebar", () => ({ AdminSidebar: () => <nav /> }));
vi.mock("../components/admin/admin-overview", () => ({ AdminOverview: () => <div /> }));
vi.mock("../components/admin/inventory-table", () => ({ InventoryTable: () => <div />, Pencil: () => <span /> }));
vi.mock("../components/admin/promotions-table", () => ({ PromotionsTable: () => <div /> }));
vi.mock("../components/admin/catalog-management", () => ({ CatalogManagement: () => <div /> }));
vi.mock("../components/admin/order-monitor", () => ({ OrderMonitor: () => <div /> }));
vi.mock("../components/admin/product-availability", () => ({ ProductAvailability: () => <div /> }));
vi.mock("../components/admin/product-image-picker", () => ({ ProductImagePicker: () => <div /> }));
vi.mock("../components/admin/product-category-filter", () => ({
  ProductCategoryFilter: () => <div />,
  filterAdminProducts: () => [],
}));

import AdminPage from "../app/admin/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.ready = false;
  authState.error = null;
  authState.user = null;
});

it("does not call Admin APIs before authentication is ready", () => {
  render(<AdminPage />);
  expect(screen.getByText("Đang kiểm tra phiên đăng nhập…")).toBeDefined();
  expect(getStore).not.toHaveBeenCalled();
});

it("does not call Admin APIs for a non-admin account", () => {
  authState.ready = true;
  authState.user = { id: "staff", role: "STAFF" };
  render(<AdminPage />);
  expect(screen.getByText("Tài khoản hiện tại không có quyền truy cập khu vực quản trị.")).toBeDefined();
  expect(getStore).not.toHaveBeenCalled();
});

it("loads the dashboard only after an admin account is ready", async () => {
  authState.ready = true;
  authState.user = { id: "admin", role: "ADMIN" };
  getStore.mockResolvedValue([]);
  render(<AdminPage />);
  await waitFor(() => expect(getStore).toHaveBeenCalledWith("/admin/dashboard"));
  expect(getStore).toHaveBeenCalledWith("/admin/products");
  expect(getStore).toHaveBeenCalledWith("/admin/sizes");
  expect(getStore).toHaveBeenCalledWith("/admin/orders");
});

it("offers an auth retry without calling Admin APIs when session checking fails", () => {
  authState.error = "Không thể kiểm tra phiên đăng nhập.";
  authState.refresh.mockResolvedValue(null);
  render(<AdminPage />);
  expect(screen.getByText("Không thể kiểm tra phiên đăng nhập.")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(authState.refresh).toHaveBeenCalledTimes(1);
  expect(getStore).not.toHaveBeenCalled();
});
