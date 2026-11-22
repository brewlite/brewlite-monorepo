import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, STAFF_CART_STORAGE_KEY, useCart } from "../components/cart/cart-provider";
import { PurchaseFlow } from "../components/checkout/purchase-flow";
import { getStore, sendStore } from "../services/store.service";
import { cancelCounterOrder, createCounterOrder, getCurrentShift, openCashShift, payCounterOrder } from "../services/pos.service";
import { calculateQuote } from "../services/quote.service";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/auth-store", () => ({
  useAuthUser: () => ({
    id: "staff-1",
    fullName: "Barista An",
    email: "staff@brewlite.local",
    role: "STAFF",
    loyaltyPoints: 0,
  }),
  useAuthStatus: () => ({ ready: true, error: null }),
  refreshAuth: vi.fn(),
}));
vi.mock("../services/auth.service", () => ({
  currentUser: async () => ({
    id: "staff-1",
    fullName: "Barista An",
    email: "staff@brewlite.local",
    role: "STAFF",
    loyaltyPoints: 0,
  }),
  authError: (err: unknown) => (err instanceof Error ? err.message : "Lỗi"),
  onSessionExpired: vi.fn(),
}));
vi.mock("../services/store.service", () => ({ getStore: vi.fn(), sendStore: vi.fn() }));
vi.mock("../services/quote.service", () => ({ calculateQuote: vi.fn() }));
vi.mock("../services/pos.service", () => ({
  cancelCounterOrder: vi.fn(),
  createCounterOrder: vi.fn(),
  payCounterOrder: vi.fn(),
  getCurrentShift: vi.fn(),
  openCashShift: vi.fn(),
}));

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

const sampleLine = {
  productId: "prod-1",
  name: "Cà phê sữa đá",
  sizeId: "size-m",
  sizeName: "M",
  quantity: 2,
  unitPrice: 35000,
  imageUrl: null,
  note: "Ít đá",
  toppings: [{ id: "top-1", name: "Trân châu", price: 5000 }],
};

function StaffCartHarness({ onSubmitted }: { onSubmitted?: () => void }) {
  const cart = useCart();
  return (
    <div>
      <p data-testid="staff-status">
        {cart.ready ? "READY" : "LOADING"}|{cart.count}|{cart.subtotal}|{cart.canCheckout ? "YES" : "NO"}
      </p>
      <button type="button" onClick={() => void cart.addLine(sampleLine)}>
        Add drink
      </button>
      {cart.lines.length > 0 && <PurchaseFlow onClose={onSubmitted ?? vi.fn()} />}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("STAFF counter checkout reusing shared menu/cart & PurchaseFlow", () => {
  it("completes QR counter payment directly without VNPay, coupon, or loyalty points", async () => {
    vi.mocked(getCurrentShift).mockResolvedValue({ current: null, history: [] });
    vi.mocked(createCounterOrder).mockResolvedValue({
      id: "pos-order-99",
      orderCode: "POS-001",
      status: "PENDING",
      finalTotal: "70000",
      version: 0,
      items: [],
      payments: [],
    } as never);
    vi.mocked(payCounterOrder).mockResolvedValue({
      id: "pay-qr-1",
      method: "WALLET",
      status: "SUCCESS",
      amount: "70000",
    } as never);

    const onSubmitted = vi.fn();
    render(
      <CartProvider>
        <StaffCartHarness onSubmitted={onSubmitted} />
      </CartProvider>,
    );

    expect(screen.getByTestId("staff-status").textContent).toBe("READY|0|0|NO");
    expect(getStore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add drink" }));

    await waitFor(() =>
      expect(screen.getByTestId("staff-status").textContent).toBe("READY|2|70000|YES"),
    );
    expect(sendStore).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("brewlite-config-cart")).toBeNull();
    expect(sessionStorage.getItem(STAFF_CART_STORAGE_KEY)).toContain("staff-1");

    await screen.findByRole("heading", { name: "Thanh toán tại quầy" });
    expect(calculateQuote).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Mã giảm giá/i)).toBeNull();
    expect(screen.queryByLabelText(/điểm thưởng/i)).toBeNull();
    expect(screen.queryByText(/VNPay/i)).toBeNull();

    fireEvent.change(screen.getByLabelText("Tên khách / Số thẻ"), {
      target: { value: "Thẻ #15" },
    });
    fireEvent.change(screen.getByLabelText("Ghi chú"), {
      target: { value: "Mang đi" },
    });

    // QR must NOT appear or mutate while typing guest label; it is generated only after creating the order & reserving stock.
    expect(screen.queryByRole("img", { name: /Mã QR thanh toán/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tạo mã QR" }));

    await waitFor(() =>
      expect(createCounterOrder).toHaveBeenCalledWith({
        items: [
          {
            productId: "prod-1",
            sizeId: "size-m",
            toppingIds: ["top-1"],
            quantity: 2,
            note: "Ít đá",
          },
        ],
        guestLabel: "Thẻ #15",
        note: "Mang đi",
      }),
    );

    const qr = await screen.findByRole("img", { name: /BREWLITE\|POS-001\|70000/ });
    expect(qr).toBeDefined();
    expect((screen.getByLabelText("Tên khách / Số thẻ") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận đã nhận QR" }));
    await waitFor(() =>
      expect(payCounterOrder).toHaveBeenCalledWith("pos-order-99", { method: "WALLET" }),
    );
    expect(createCounterOrder).toHaveBeenCalledTimes(1);
    expect(onSubmitted).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/staff/orders");
    await waitFor(() =>
      expect(screen.getByTestId("staff-status").textContent).toBe("READY|0|0|NO"),
    );
    void cancelCounterOrder;
  });

  it("collects cash with change calculation when shift is open", async () => {
    vi.mocked(getCurrentShift).mockResolvedValue({
      current: {
        id: "shift-open-1",
        status: "OPEN",
        staff: { id: "staff-1", fullName: "Barista An", email: "staff@brewlite.local" },
        reconciledByAdmin: null,
        openingFloat: "500000",
        cashCollected: "0",
        cashRefunded: "0",
        netCash: "0",
        expectedCash: null,
        countedCash: null,
        variance: null,
        closingNote: null,
        reconcileNote: null,
        openedAt: "2026-11-22T01:00:00.000Z",
        closedAt: null,
        reconciledAt: null,
        cashPaymentCount: 0,
        cashRefundCount: 0,
        payments: [],
        refunds: [],
      },
      history: [],
    });
    vi.mocked(createCounterOrder).mockResolvedValue({
      id: "pos-order-100",
      orderCode: "POS-002",
      status: "PENDING",
      finalTotal: "70000",
      version: 0,
      items: [],
      payments: [],
    } as never);
    vi.mocked(payCounterOrder).mockResolvedValue({
      id: "pay-cash-1",
      method: "CASH",
      status: "SUCCESS",
      amount: "70000",
    } as never);
    void openCashShift;

    render(
      <CartProvider>
        <StaffCartHarness />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add drink" }));
    await screen.findByRole("button", { name: "Thu tiền mặt" });
    fireEvent.change(screen.getByLabelText("Tiền khách đưa (VND)"), {
      target: { value: "100000" },
    });
    expect(screen.getByText("30.000đ")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Thu tiền mặt" }));
    await waitFor(() =>
      expect(payCounterOrder).toHaveBeenCalledWith("pos-order-100", {
        method: "CASH",
        cashTendered: 100000,
      }),
    );
    expect(push).toHaveBeenCalledWith("/staff/orders");
  });
});
