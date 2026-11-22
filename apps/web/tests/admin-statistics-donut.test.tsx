import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  AdminStatistics,
  type AdminStatisticsData,
} from "../components/admin/admin-statistics";

afterEach(cleanup);

const fixture = (): AdminStatisticsData => ({
  revenue: {
    total: "550000",
    paidOrders: 11,
    averageOrderValue: "50000",
    counterCash: { revenue: "100000", orders: 2 },
    counterQr: { revenue: "150000", orders: 3 },
    online: { revenue: "300000", orders: 6 },
  },
  statusCounts: {
    COMPLETED: 8,
    PAID: 1,
    PREPARING: 1,
    READY: 1,
    PENDING: 2,
    PAYMENT_FAILED: 1,
    CANCELLED: 2,
  },
  totalOrders: 16,
  discounts: {
    couponOrders: 0,
    couponDiscountTotal: "0",
    pointsOrders: 0,
    pointsUsedTotal: 0,
    pointsDiscountTotal: "0",
  },
  topProducts: [],
  cashSummary: {
    pendingShiftCount: 0,
    pendingCashTotal: "0",
    reconciledCashTotal: "0",
    totalVariance: "0",
  },
});

const chart = () =>
  screen.getByRole("group", { name: "Biểu đồ tỷ lệ trạng thái đơn hàng" });

function layout(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>(".stats-donut-layout");
  if (!element) throw new Error("Donut layout missing");
  return element;
}

function center(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>(".stats-donut-center");
  if (!element) throw new Error("Donut center missing");
  return element;
}

function legend(container: HTMLElement) {
  const element = container.querySelector<HTMLElement>(".stats-donut-legend");
  if (!element) throw new Error("Donut legend missing");
  return within(element);
}

it("shows total orders by default, inline breakdowns in legend, and no tooltip or helper prose", () => {
  const { container } = render(<AdminStatistics data={fixture()} />);
  expect(within(chart()).getAllByRole("button")).toHaveLength(4);
  expect(center(container).textContent).toContain("16");
  expect(center(container).textContent).toContain("Tổng đơn");
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(screen.queryByText(/Di chuột|chọn một nhóm/)).toBeNull();

  const legendBox = container.querySelector(".stats-donut-legend")!;
  expect(legendBox.textContent).toContain("Đã thanh toán: 1");
  expect(legendBox.textContent).toContain("Đang pha chế: 1");
  expect(legendBox.textContent).toContain("Sẵn sàng: 1");
  expect(legendBox.textContent).toContain("Chờ thanh toán: 2");
  expect(legendBox.textContent).toContain("Thanh toán lỗi: 1");
});

it("updates the donut center and highlights the matching legend item when a slice is hovered", () => {
  const { container } = render(<AdminStatistics data={fixture()} />);
  const slice = within(chart()).getByRole("button", {
    name: "Đang phục vụ: 3 đơn (18.8%)",
  });
  const legendItem = legend(container).getByRole("button", {
    name: "Đang phục vụ: 3 đơn (18.8%)",
  });

  fireEvent.mouseEnter(slice);

  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(center(container).textContent).toContain("18.8%");
  expect(center(container).textContent).toContain("Đang phục vụ");
  expect(legendItem.className).toContain("active");
  expect(slice.getAttribute("class")).toContain("active");

  fireEvent.mouseLeave(slice);
  expect(center(container).textContent).toContain("16");
  expect(center(container).textContent).toContain("Tổng đơn");
  expect(legendItem.className).not.toContain("active");
});

it("highlights the matching slice and updates the donut center when a legend item is hovered", () => {
  const { container } = render(<AdminStatistics data={fixture()} />);
  const item = legend(container).getByRole("button", {
    name: "Chờ thanh toán: 3 đơn (18.8%)",
  });
  const slice = within(chart()).getByRole("button", {
    name: "Chờ thanh toán: 3 đơn (18.8%)",
  });

  fireEvent.mouseEnter(item);
  expect(center(container).textContent).toContain("18.8%");
  expect(center(container).textContent).toContain("Chờ thanh toán");
  expect(slice.getAttribute("class")).toContain("active");
  expect(item.className).toContain("active");
  expect(screen.queryByRole("tooltip")).toBeNull();

  fireEvent.mouseLeave(layout(container));
  expect(center(container).textContent).toContain("16");
  expect(center(container).textContent).toContain("Tổng đơn");
});

it("supports keyboard focus, blur, switching targets, and Escape dismissal", () => {
  const { container } = render(<AdminStatistics data={fixture()} />);
  const cancelledSlice = within(chart()).getByRole("button", {
    name: "Đã hủy: 2 đơn (12.5%)",
  });
  const completedLegend = legend(container).getByRole("button", {
    name: "Hoàn tất: 8 đơn (50%)",
  });

  fireEvent.focus(cancelledSlice);
  expect(center(container).textContent).toContain("12.5%");
  expect(center(container).textContent).toContain("Đã hủy");

  fireEvent.blur(cancelledSlice);
  expect(center(container).textContent).toContain("16");
  expect(center(container).textContent).toContain("Tổng đơn");

  fireEvent.mouseEnter(cancelledSlice);
  fireEvent.focus(completedLegend);
  expect(center(container).textContent).toContain("50%");
  expect(center(container).textContent).toContain("Hoàn tất");

  fireEvent.keyDown(completedLegend, { key: "Escape" });
  expect(center(container).textContent).toContain("16");
  expect(center(container).textContent).toContain("Tổng đơn");
});

it.each(["Enter", " "])("allows the %j key to focus a slice without requiring a mouse", (key) => {
  const { container } = render(<AdminStatistics data={fixture()} />);
  const slice = within(chart()).getByRole("button", {
    name: "Đang phục vụ: 3 đơn (18.8%)",
  });
  fireEvent.focus(slice);
  fireEvent.keyDown(slice, { key });
  expect(center(container).textContent).toContain("18.8%");
  expect(center(container).textContent).toContain("Đang phục vụ");
});

it("renders an empty ring and disables zero-count legend controls without invalid percentages", () => {
  const data = fixture();
  data.statusCounts = {};
  data.totalOrders = 0;
  const { container } = render(<AdminStatistics data={data} />);

  expect(within(chart()).queryAllByRole("button")).toHaveLength(0);
  expect(screen.getByText("Chưa có đơn")).toBeDefined();
  const items = legend(container).getAllByRole("button");
  expect(items).toHaveLength(4);
  for (const item of items) {
    expect((item as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(item);
  }
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(container.textContent).not.toMatch(/NaN|Infinity/);
});

it("draws a complete circle for one nonzero status and exposes its 100 percent share", () => {
  const data = fixture();
  data.statusCounts = { COMPLETED: 4 };
  data.totalOrders = 4;
  const { container } = render(<AdminStatistics data={data} />);
  const slice = within(chart()).getByRole("button", {
    name: "Hoàn tất: 4 đơn (100%)",
  });
  expect(within(chart()).getAllByRole("button")).toHaveLength(1);
  expect(slice.tagName.toLowerCase()).toBe("circle");
  expect(
    legend(container)
      .getAllByRole("button")
      .filter((item) => !(item as HTMLButtonElement).disabled),
  ).toHaveLength(1);
  fireEvent.mouseEnter(slice);
  expect(center(container).textContent).toContain("100%");
  expect(center(container).textContent).toContain("Hoàn tất");
});

it("updates center percentages cleanly when data refreshes or becomes empty", () => {
  const { container, rerender } = render(<AdminStatistics data={fixture()} />);
  fireEvent.click(
    legend(container).getByRole("button", {
      name: "Hoàn tất: 8 đơn (50%)",
    }),
  );
  expect(center(container).textContent).toContain("50%");

  const next = fixture();
  next.statusCounts = { COMPLETED: 2, CANCELLED: 6 };
  next.totalOrders = 8;
  rerender(<AdminStatistics data={next} />);
  expect(center(container).textContent).toContain("25%");
  expect(center(container).textContent).not.toContain("50%");

  rerender(
    <AdminStatistics data={{ ...fixture(), totalOrders: 0, statusCounts: {} }} />,
  );
  expect(within(chart()).queryAllByRole("button")).toHaveLength(0);
  expect(center(container).textContent).toContain("Chưa có đơn");
});
