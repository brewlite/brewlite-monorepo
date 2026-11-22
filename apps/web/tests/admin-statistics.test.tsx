import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AdminStatistics,
  type AdminStatisticsData,
} from "../components/admin/admin-statistics";

afterEach(cleanup);

function sampleStats(
  overrides: Partial<AdminStatisticsData> = {},
): AdminStatisticsData {
  return {
    revenue: {
      total: "150000",
      paidOrders: 3,
      averageOrderValue: "50000",
      counterCash: { revenue: "50000", orders: 1 },
      counterQr: { revenue: "40000", orders: 1 },
      online: { revenue: "60000", orders: 1 },
    },
    statusCounts: {
      PENDING: 1,
      PAYMENT_FAILED: 0,
      PAID: 1,
      PREPARING: 0,
      READY: 0,
      COMPLETED: 2,
      CANCELLED: 1,
    },
    totalOrders: 5,
    discounts: {
      couponOrders: 1,
      couponDiscountTotal: "10000",
      pointsOrders: 1,
      pointsUsedTotal: 50,
      pointsDiscountTotal: "5000",
    },
    topProducts: [
      {
        productId: "p1",
        productName: "Cà phê sữa đá",
        quantity: 5,
        revenue: "150000",
      },
    ],
    cashSummary: {
      pendingShiftCount: 1,
      pendingCashTotal: "550000",
      reconciledCashTotal: "0",
      totalVariance: "0",
    },
    ...overrides,
  };
}

describe("AdminStatistics", () => {
  it("renders channel revenue breakdown, order statuses, top products and discounts", () => {
    render(<AdminStatistics data={sampleStats()} />);

    expect(screen.getAllByText("150.000đ").length).toBeGreaterThan(0);
    expect(screen.getByText("50.000đ")).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
    expect(screen.getByText("Tại quầy · Tiền mặt")).toBeDefined();
    expect(screen.getByText("Tại quầy · Chuyển khoản QR")).toBeDefined();
    expect(screen.getByText("Đặt online")).toBeDefined();
    expect(screen.getByText("2 đơn hoàn tất")).toBeDefined();
    expect(screen.getByText("Cà phê sữa đá")).toBeDefined();
    expect(screen.getByText("5 ly")).toBeDefined();
    expect(screen.getByText("10.000đ")).toBeDefined();
    expect(screen.getByText("5.000đ")).toBeDefined();
  });

  it("updates donut center and highlights legend on hover without duplicate tooltip or helper text", () => {
    const { container } = render(<AdminStatistics data={sampleStats()} />);

    const center = container.querySelector(".stats-donut-center")!;
    expect(center.textContent).toContain("5");
    expect(center.textContent).toContain("Tổng đơn");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByText(/Di chuột/)).toBeNull();
    expect(screen.getByText("Đã thanh toán: 1")).toBeDefined();

    const servingSlice = container.querySelector(
      '[data-status-key="serving"]',
    ) as SVGElement;
    expect(servingSlice).not.toBeNull();
    fireEvent.mouseEnter(servingSlice);

    expect(center.textContent).toContain("20%");
    expect(center.textContent).toContain("Đang phục vụ");
    expect(screen.queryByRole("tooltip")).toBeNull();
    const legendEl = container.querySelector<HTMLElement>(".stats-donut-legend")!;
    expect(
      within(legendEl)
        .getByRole("button", { name: "Đang phục vụ: 1 đơn (20%)" })
        .className,
    ).toContain("active");

    fireEvent.mouseLeave(servingSlice);
    expect(center.textContent).toContain("5");
    expect(center.textContent).toContain("Tổng đơn");

    const completedLegend = within(legendEl).getByRole("button", {
      name: "Hoàn tất: 2 đơn (40%)",
    });
    fireEvent.mouseEnter(completedLegend);
    expect(center.textContent).toContain("40%");
    expect(center.textContent).toContain("Hoàn tất");
    expect(
      container
        .querySelector('[data-status-key="completed"]')
        ?.getAttribute("class"),
    ).toContain("active");
  });

  it("handles empty orders and single-status 100% orders cleanly", () => {
    const { container, rerender } = render(
      <AdminStatistics
        data={sampleStats({
          totalOrders: 0,
          statusCounts: {
            PENDING: 0,
            PAYMENT_FAILED: 0,
            PAID: 0,
            PREPARING: 0,
            READY: 0,
            COMPLETED: 0,
            CANCELLED: 0,
          },
          topProducts: [],
        })}
      />,
    );

    expect(container.querySelector(".stats-donut-center")?.textContent).toContain(
      "Chưa có đơn",
    );
    expect(container.querySelectorAll(".stats-donut-slice")).toHaveLength(0);

    rerender(
      <AdminStatistics
        data={sampleStats({
          totalOrders: 3,
          statusCounts: {
            PENDING: 0,
            PAYMENT_FAILED: 0,
            PAID: 0,
            PREPARING: 0,
            READY: 0,
            COMPLETED: 3,
            CANCELLED: 0,
          },
        })}
      />,
    );

    const fullSlice = container.querySelector(
      'circle[data-status-key="completed"]',
    );
    expect(fullSlice).not.toBeNull();
    fireEvent.mouseEnter(fullSlice!);
    expect(container.querySelector(".stats-donut-center")?.textContent).toContain(
      "100%",
    );
  });
});
