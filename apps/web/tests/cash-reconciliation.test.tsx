import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CashReconciliation } from "../components/admin/cash-reconciliation";
import { reconcileAdminShift, type AdminCashShiftsResponse } from "../services/pos.service";

vi.mock("../services/pos.service", () => ({
  reconcileAdminShift: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  },
});

const fixture: AdminCashShiftsResponse = {
  summary: {
    cashRevenue: "120000",
    cashOrders: 2,
    posNonCashRevenue: "45000",
    posNonCashOrders: 1,
    appOnlineRevenue: "90000",
    appOnlineOrders: 2,
    pendingCashToCollect: "620000",
    reconciledCashTotal: "0",
    totalVariance: "0",
    openShiftsCount: 0,
    closedPendingCount: 1,
    reconciledCount: 0,
  },
  shifts: [
    {
      id: "shift-1",
      status: "CLOSED",
      staff: { id: "s1", fullName: "Nguyễn Văn Pha Chế", email: "staff@brewlite.local" },
      reconciledByAdmin: null,
      openingFloat: "500000",
      cashCollected: "155000",
      cashRefunded: "35000",
      netCash: "120000",
      expectedCash: "620000",
      countedCash: "620000",
      variance: "0",
      closingNote: "Khớp két",
      reconcileNote: null,
      openedAt: "2026-11-22T01:00:00.000Z",
      closedAt: "2026-11-22T09:00:00.000Z",
      reconciledAt: null,
      cashPaymentCount: 2,
      cashRefundCount: 1,
      payments: [
        {
          id: "p1",
          orderId: "o1",
          orderCode: "POS-1001",
          guestLabel: "Anh Minh",
          orderStatus: "COMPLETED",
          amount: "120000",
          cashTendered: "200000",
          changeGiven: "80000",
          createdAt: "2026-11-22T02:00:00.000Z",
        },
      ],
      refunds: [
        {
          id: "r1",
          paymentId: "p2",
          orderId: "o2",
          orderCode: "POS-1002",
          guestLabel: "Chị Lan",
          amount: "35000",
          reason: "Khách đổi ý tại quầy",
          createdAt: "2026-11-22T03:00:00.000Z",
        },
      ],
    },
  ],
};

it("displays separated cash/non-cash channel revenue and lets Admin reconcile a closed shift", async () => {
  const onRefresh = vi.fn();
  vi.mocked(reconcileAdminShift).mockResolvedValue({
    ...fixture.shifts[0],
    status: "RECONCILED",
    reconciledByAdmin: { id: "a1", fullName: "Quản trị viên", email: "admin@brewlite.local" },
    reconciledAt: "2026-11-22T10:00:00.000Z",
    reconcileNote: "Đã nhận đủ 620k",
  });

  render(<CashReconciliation data={fixture} onRefresh={onRefresh} />);

  expect(screen.getAllByText("620.000đ").length).toBeGreaterThan(0);
  expect(screen.getByText("120.000đ")).toBeDefined();
  expect(screen.getAllByText("Chờ thu quỹ").length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: "Thu quỹ" }));
  expect(screen.getByText(/POS-1001 · Anh Minh/)).toBeDefined();
  expect(screen.getByText(/Khách đổi ý tại quầy/)).toBeDefined();

  fireEvent.change(screen.getByLabelText("Ghi chú thu quỹ"), {
    target: { value: "Đã nhận đủ 620k" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận thu quỹ" }));

  await waitFor(() => {
    expect(reconcileAdminShift).toHaveBeenCalledWith("shift-1", "Đã nhận đủ 620k");
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
  expect(screen.getByText(/Đã thu 620\.000đ/i)).toBeDefined();
});
