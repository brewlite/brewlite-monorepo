import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromotionsTable } from "../components/admin/promotions-table";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../services/store.service", () => ({ sendStore: send }));
const row = { id: "promo", code: "WELCOME10", discountType: "PERCENTAGE", discountValue: "10", minOrderValue: "40000", maxDiscount: "20000", usageLimit: 500, usedCount: 3, isActive: true, startDate: "2026-01-01T00:00:00Z", endDate: "2026-12-31T00:00:00Z" };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("formats the actual discount and searches promotion codes", () => {
  render(<PromotionsTable rows={[row]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByText("10%")).toBeDefined();
  expect(screen.getByText("3 / 500")).toBeDefined();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
  expect(screen.queryByText("WELCOME10")).toBeNull();
  expect(screen.getByText("Không tìm thấy mã phù hợp.")).toBeDefined();
});
it("updates only the application flag through the existing API", async () => {
  send.mockResolvedValue({}); const refresh = vi.fn();
  render(<PromotionsTable rows={[row]} onEdit={vi.fn()} onRefresh={refresh} />);
  fireEvent.click(screen.getByRole("switch", { name: "Áp dụng WELCOME10" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  expect(send).toHaveBeenCalledWith("/admin/promotions/promo", { isActive: false }, "patch");
});
it("optimistically switches off, locks pending requests, then rolls back on server failure", async () => {
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(<PromotionsTable rows={[row]} onEdit={vi.fn()} onRefresh={vi.fn()} />);
  const toggle = screen.getByRole("switch");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(toggle.hasAttribute("disabled")).toBe(true);
  reject(new Error("failed"));
  await screen.findByRole("alert");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(toggle.hasAttribute("disabled")).toBe(false);
});
