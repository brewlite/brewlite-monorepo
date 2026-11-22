"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { formatPrice } from "../../lib/format-price";
import "./admin-statistics.css";

export type AdminStatisticsData = {
  revenue: {
    total: string;
    paidOrders: number;
    averageOrderValue: string;
    counterCash: { revenue: string; orders: number };
    counterQr: { revenue: string; orders: number };
    online: { revenue: string; orders: number };
  };
  statusCounts: Record<string, number>;
  totalOrders: number;
  discounts: {
    couponOrders: number;
    couponDiscountTotal: string;
    pointsOrders: number;
    pointsUsedTotal: number;
    pointsDiscountTotal: string;
  };
  topProducts: {
    productId: string;
    productName: string;
    quantity: number;
    revenue: string;
  }[];
  cashSummary: {
    pendingShiftCount: number;
    pendingCashTotal: string;
    reconciledCashTotal: string;
    totalVariance: string;
  };
};

type StatusSegment = {
  key: string;
  label: string;
  count: number;
  color: string;
  details: string[];
};

type DonutArc = StatusSegment & {
  pctLabel: string;
  isFullCircle: boolean;
  pathD: string;
};

const money = (value: string | number) => `${formatPrice(value)}đ`;

const formatPercent = (count: number, total: number) => {
  if (total <= 0) return "0%";
  const raw = (count / total) * 100;
  return `${Number.isInteger(raw) ? raw : raw.toFixed(1)}%`;
};

const DONUT_CENTER = 120;
const DONUT_RADIUS = 88;

function buildDonutArcs(segments: StatusSegment[]): {
  arcs: DonutArc[];
  total: number;
} {
  const active = segments.filter((seg) => seg.count > 0);
  const total = active.reduce((sum, seg) => sum + seg.count, 0);
  if (total <= 0) return { arcs: [], total: 0 };

  let cursor = -Math.PI / 2;
  const arcs: DonutArc[] = active.map((seg) => {
    const span = (seg.count / total) * Math.PI * 2;
    const startAngle = cursor;
    const endAngle = cursor + span;
    cursor = endAngle;

    if (active.length === 1) {
      return {
        ...seg,
        pctLabel: "100%",
        isFullCircle: true,
        pathD: "",
      };
    }

    const gapAngle = Math.min(0.032, span * 0.2);
    const a1 = startAngle + gapAngle / 2;
    const a2 = endAngle - gapAngle / 2;
    const x1 = DONUT_CENTER + DONUT_RADIUS * Math.cos(a1);
    const y1 = DONUT_CENTER + DONUT_RADIUS * Math.sin(a1);
    const x2 = DONUT_CENTER + DONUT_RADIUS * Math.cos(a2);
    const y2 = DONUT_CENTER + DONUT_RADIUS * Math.sin(a2);
    const largeArc = a2 - a1 > Math.PI ? 1 : 0;

    return {
      ...seg,
      pctLabel: formatPercent(seg.count, total),
      isFullCircle: false,
      pathD: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    };
  });

  return { arcs, total };
}

export function AdminStatistics({ data }: { data: AdminStatisticsData }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const chartId = useId();

  function hoverSegment(key: string) {
    setHoveredKey(key);
    setFocusedKey(null);
  }

  function focusSegment(key: string) {
    setFocusedKey(key);
    setHoveredKey(null);
  }

  function handleSliceKey(event: KeyboardEvent<SVGElement>, key: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focusSegment(key);
    }
  }

  const totalRevNum = Number(data.revenue.total);
  const completedCount = data.statusCounts.COMPLETED ?? 0;
  const cancelledCount = data.statusCounts.CANCELLED ?? 0;
  const paidCount = data.statusCounts.PAID ?? 0;
  const preparingCount = data.statusCounts.PREPARING ?? 0;
  const readyCount = data.statusCounts.READY ?? 0;
  const pendingCount = data.statusCounts.PENDING ?? 0;
  const failedCount = data.statusCounts.PAYMENT_FAILED ?? 0;

  const activeServing = paidCount + preparingCount + readyCount;
  const unpaidCount = pendingCount + failedCount;
  const completionRate =
    data.totalOrders > 0
      ? Math.round((completedCount / data.totalOrders) * 100)
      : 0;

  const servingDetails = [
    paidCount > 0 ? `Đã thanh toán: ${paidCount}` : "",
    preparingCount > 0 ? `Đang pha chế: ${preparingCount}` : "",
    readyCount > 0 ? `Sẵn sàng: ${readyCount}` : "",
  ].filter(Boolean);

  const unpaidDetails =
    failedCount > 0
      ? [
          pendingCount > 0 ? `Chờ thanh toán: ${pendingCount}` : "",
          `Thanh toán lỗi: ${failedCount}`,
        ].filter(Boolean)
      : [];

  const statusSegments: StatusSegment[] = [
    {
      key: "completed",
      label: "Hoàn tất",
      count: completedCount,
      color: "#196642",
      details: [],
    },
    {
      key: "serving",
      label: "Đang phục vụ",
      count: activeServing,
      color: "#0b5394",
      details: servingDetails,
    },
    {
      key: "unpaid",
      label: "Chờ thanh toán",
      count: unpaidCount,
      color: "#d9822b",
      details: unpaidDetails,
    },
    {
      key: "cancelled",
      label: "Đã hủy",
      count: cancelledCount,
      color: "#8c939d",
      details: [],
    },
  ];

  const { arcs, total: donutTotal } = buildDonutArcs(statusSegments);
  const activeKey = hoveredKey ?? focusedKey;
  const activeSegment = activeKey
    ? statusSegments.find((seg) => seg.key === activeKey && seg.count > 0) ?? null
    : null;

  const channels = [
    {
      key: "cash",
      label: "Tại quầy · Tiền mặt",
      revenue: data.revenue.counterCash.revenue,
      orders: data.revenue.counterCash.orders,
    },
    {
      key: "qr",
      label: "Tại quầy · Chuyển khoản QR",
      revenue: data.revenue.counterQr.revenue,
      orders: data.revenue.counterQr.orders,
    },
    {
      key: "online",
      label: "Đặt online",
      revenue: data.revenue.online.revenue,
      orders: data.revenue.online.orders,
    },
  ];

  return (
    <div className="admin-stats">
      <div className="stats-kpi-grid">
        <article className="stats-kpi">
          <small>Tổng doanh thu</small>
          <strong>{money(data.revenue.total)}</strong>
          <span>{data.revenue.paidOrders} đơn đã thanh toán</span>
        </article>
        <article className="stats-kpi">
          <small>Giá trị đơn trung bình</small>
          <strong>{money(data.revenue.averageOrderValue)}</strong>
          <span>Trên mỗi đơn đã thanh toán</span>
        </article>
        <article className="stats-kpi">
          <small>Tỷ lệ hoàn tất</small>
          <strong>{completionRate}%</strong>
          <span>
            {completedCount} / {data.totalOrders} đơn
          </span>
        </article>
        <article className="stats-kpi">
          <small>Đơn đã hủy</small>
          <strong>{cancelledCount}</strong>
          <span>{unpaidCount} đơn chưa thanh toán</span>
        </article>
      </div>

      <div className="stats-split">
        <section className="stats-card" aria-label="Doanh thu theo kênh">
          <h2>Doanh thu theo kênh</h2>
          <div className="stats-bars">
            {channels.map((ch) => {
              const revNum = Number(ch.revenue);
              const pct =
                totalRevNum > 0 ? Math.round((revNum / totalRevNum) * 100) : 0;
              return (
                <div className="stats-bar-row" key={ch.key}>
                  <div className="stats-bar-head">
                    <strong>{ch.label}</strong>
                    <span>
                      {money(ch.revenue)} · {ch.orders} đơn ({pct}%)
                    </span>
                  </div>
                  <div className="stats-bar-track" aria-hidden="true">
                    <div
                      className="stats-bar-fill"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="stats-card stats-status-card" aria-label="Trạng thái đơn hàng">
          <h2>Trạng thái đơn hàng</h2>
          <div
            className="stats-donut-layout"
            onMouseLeave={() => { setHoveredKey(null); setFocusedKey(null); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setHoveredKey(null);
                setFocusedKey(null);
              }
            }}
          >
            <div className="stats-donut-stage">
              <svg
                className="stats-donut-svg"
                viewBox="0 0 240 240"
                role="group"
                aria-label="Biểu đồ tỷ lệ trạng thái đơn hàng"
              >
                <circle
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke="#eef0f4"
                  strokeWidth={34}
                  aria-hidden="true"
                />
                {arcs.map((arc) => {
                  const isActive = activeSegment?.key === arc.key;
                  const isDimmed = activeSegment !== null && !isActive;
                  const commonProps = {
                    fill: "none" as const,
                    stroke: arc.color,
                    strokeWidth: isActive ? 40 : 34,
                    className: `stats-donut-slice${isActive ? " active" : ""}${isDimmed ? " dimmed" : ""}`,
                    tabIndex: 0,
                    role: "button" as const,
                    "data-status-key": arc.key,
                    "aria-label": `${arc.label}: ${arc.count} đơn (${arc.pctLabel})`,
                    "aria-describedby": arc.details.length ? `${chartId}-${arc.key}-details` : undefined,
                    onMouseEnter: () => hoverSegment(arc.key),
                    onMouseLeave: () => setHoveredKey(null),
                    onFocus: () => focusSegment(arc.key),
                    onBlur: () => setFocusedKey(null),
                    onClick: () => focusSegment(arc.key),
                    onKeyDown: (event: KeyboardEvent<SVGElement>) => handleSliceKey(event, arc.key),
                  };
                  return arc.isFullCircle ? (
                    <circle
                      key={arc.key}
                      cx={DONUT_CENTER}
                      cy={DONUT_CENTER}
                      r={DONUT_RADIUS}
                      {...commonProps}
                    />
                  ) : (
                    <path key={arc.key} d={arc.pathD} {...commonProps} />
                  );
                })}
              </svg>

              <div className="stats-donut-center" aria-hidden="true">
                {activeSegment ? (
                  <>
                    <strong>
                      {formatPercent(activeSegment.count, donutTotal)}
                    </strong>
                    <span>{activeSegment.label}</span>
                  </>
                ) : (
                  <>
                    <strong>{data.totalOrders}</strong>
                    <span>{data.totalOrders > 0 ? "Tổng đơn" : "Chưa có đơn"}</span>
                  </>
                )}
              </div>

            </div>

            <div className="stats-donut-legend">
              {statusSegments.map((seg) => {
                const isActive = activeSegment?.key === seg.key;
                return (
                  <button
                    type="button"
                    key={seg.key}
                    className={`stats-legend-item${isActive ? " active" : ""}`}
                    disabled={seg.count <= 0}
                    aria-label={`${seg.label}: ${seg.count} đơn (${formatPercent(seg.count, donutTotal)})`}
                    aria-describedby={seg.details.length ? `${chartId}-${seg.key}-details` : undefined}
                    onMouseEnter={() => { if (seg.count > 0) hoverSegment(seg.key); }}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => focusSegment(seg.key)}
                    onBlur={() => setFocusedKey(null)}
                    onClick={() => focusSegment(seg.key)}
                  >
                    <span className="stats-legend-label">
                      <i
                        className="stats-legend-dot"
                        style={{ background: seg.color }}
                      />
                      <span className="stats-legend-copy">
                        <span>{seg.label}</span>
                        {seg.details.length > 0 && <small id={`${chartId}-${seg.key}-details`}>{seg.details.join(" · ")}</small>}
                      </span>
                    </span>
                    <span className="stats-legend-val">
                      <strong>{seg.count}</strong>
                      <small>({formatPercent(seg.count, donutTotal)})</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="stats-card" aria-label="Top món bán chạy">
        <div className="stats-card-head">
          <h2>Top món bán chạy</h2>
          <span>{completedCount} đơn hoàn tất</span>
        </div>
        {!data.topProducts.length ? (
          <p className="stats-empty">Chưa có dữ liệu bán hàng.</p>
        ) : (
          <div className="admin-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sản phẩm</th>
                  <th>Số ly</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((item, idx) => (
                  <tr key={`${item.productId}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{item.productName}</strong>
                    </td>
                    <td>{item.quantity} ly</td>
                    <td>
                      <strong>{money(item.revenue)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stats-card" aria-label="Khuyến mãi và điểm thưởng">
        <h2>Khuyến mãi & Điểm thưởng</h2>
        <div className="stats-promo-grid">
          <div className="stats-promo-box">
            <span>Giảm từ mã khuyến mãi</span>
            <strong>{money(data.discounts.couponDiscountTotal)}</strong>
            <small>{data.discounts.couponOrders} đơn áp dụng</small>
          </div>
          <div className="stats-promo-box">
            <span>Giảm từ điểm thưởng</span>
            <strong>{money(data.discounts.pointsDiscountTotal)}</strong>
            <small>
              {data.discounts.pointsUsedTotal} điểm · {data.discounts.pointsOrders} đơn
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
