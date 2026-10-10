"use client";

import { useEffect, useRef, useState } from "react";

export type UsagePoint = { date: string; total: number; [key: string]: string | number };
export const SERVICE_COLORS: Record<string, string> = { all: "#02492a", image: "#0284c7", image2image: "#d97706", tts: "#059669", video: "#7c3aed" };
export function serviceColor(code: string): string {
  return SERVICE_COLORS[code] ?? ["#db2777", "#0891b2", "#6366f1"][Array.from(code).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 3];
}
const numberFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatTimestamp(value: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric", hour: "numeric", minute: "2-digit", month: "short", timeZone,
  }).format(new Date(value));
}
function formatBucket(value: string, minutes: number): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(minutes >= 360 ? { month: "short", day: "numeric" } as const : {}),
    hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}
export function serviceLabel(value?: string, products: Array<{ code: string; name: string }> = []): string {
  return products.find((product) => product.code === value)?.name ?? value ?? "Unknown product";
}
export function UsageWindow({ start, end }: { start: string; end: string }) {
  return <div className="usage-window">
    <p>Local ({Intl.DateTimeFormat().resolvedOptions().timeZone}): {formatTimestamp(start)} – {formatTimestamp(end)}</p>
    <p>UTC: {formatTimestamp(start, "UTC")} – {formatTimestamp(end, "UTC")}</p>
  </div>;
}

export function tooltipPosition(cursor: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }) {
  const gap = 12;
  const inset = 8;
  const x = cursor.x + gap + size.width <= cursor.width - inset ? cursor.x + gap : cursor.x - size.width - gap;
  const y = cursor.y + gap + size.height <= cursor.height - inset ? cursor.y + gap : cursor.y - size.height - gap;
  return {
    left: Math.max(inset, Math.min(x, cursor.width - size.width - inset)),
    top: Math.max(inset, Math.min(y, cursor.height - size.height - inset)),
  };
}

export function UsageChart({ series, bucketMinutes, sampledAt, periodStart, periodEnd, products = [], includeTotal = true, colors, compact = false, chartLabel = "Combined and individual service request volume" }: {
  compact?: boolean; includeTotal?: boolean; colors?: Record<string, string>; chartLabel?: string;
  products?: Array<{ code: string; name: string }>; series: UsagePoint[]; bucketMinutes: number; sampledAt: string; periodStart: string; periodEnd: string;
}) {
  const SERVICES = [...new Set([...products.map((product) => product.code), ...series.flatMap((point) => Object.keys(point).filter((key) => key !== "date" && key !== "total"))])];
  const color = (code: string) => colors?.[code] ?? serviceColor(code);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; width: number; height: number; containerHeight: number } | null>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const [inspectorSize, setInspectorSize] = useState({ width: 280, height: 160 });
  useEffect(() => {
    const inspector = inspectorRef.current;
    if (!inspector) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = inspector.getBoundingClientRect();
      setInspectorSize((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(inspector);
    return () => observer.disconnect();
  }, [series]);
  const available = series.filter((point) => new Date(point.date).getTime() <= new Date(sampledAt).getTime());
  const start = new Date(periodStart).getTime();
  const end = Math.max(start, new Date(periodEnd).getTime());
  const duration = Math.max(1, end - start);
  const activeIndex = Math.min(selectedIndex ?? Math.max(0, available.length - 1), Math.max(0, available.length - 1));
  const active = available[activeIndex];
  const width = compact ? 520 : 780;
  const height = 248;
  const left = compact ? 48 : 38;
  const right = 14;
  const top = 18;
  const bottom = compact ? 44 : 32;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const actualMaxValue = Math.max(0, ...available.map((point) => point.total));
  // Reserve at least 20% headroom, with evenly spaced whole-request ticks.
  const tickStep = Math.max(1, Math.ceil((actualMaxValue * 1.2) / 4));
  const roundedMax = tickStep * 4;
  const lines = (includeTotal ? ["all", ...SERVICES] : SERVICES).map((service) => {
    const coordinates = available.map((point) => ({
      x: left + ((new Date(point.date).getTime() - start) / duration) * chartWidth,
      y: top + chartHeight - ((service === "all" ? point.total : Number(point[service] ?? 0)) / roundedMax) * chartHeight,
    }));
    // Horizontal control points preserve the original smooth curve without overshoot.
    const path = coordinates.map((point, index) => {
      if (index === 0) return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      const previous = coordinates[index - 1];
      const third = (point.x - previous.x) / 3;
      return `C${(previous.x + third).toFixed(2)} ${previous.y.toFixed(2)} ${(point.x - third).toFixed(2)} ${point.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }).join(" ");
    return { service, coordinates, path };
  });
  const coordinates = lines[0]?.coordinates ?? [];
  const tickCount = compact ? (bucketMinutes >= 360 ? 3 : 4) : 8;
  const ticks = end > start ? Array.from({ length: tickCount }, (_, index) => start + ((end - start) * index) / (tickCount - 1)) : [start];

  return (
    <div className="usage-chart-wrap" tabIndex={0} role="group"
      style={cursor ? { minHeight: cursor.containerHeight } : undefined}
      aria-label={`${chartLabel}. Use arrow keys to explore intervals.`}
      onPointerLeave={() => { setSelectedIndex(null); setCursor(null); }}
      onBlur={() => { setSelectedIndex(null); setCursor(null); }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        setCursor(null);
        if (event.key === "Escape") setSelectedIndex(null);
        else setSelectedIndex(event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : Math.max(0, Math.min(available.length - 1, activeIndex + (event.key === "ArrowRight" ? 1 : -1))));
      }}>

      <svg
        aria-label={`${chartLabel}. Peak interval: ${actualMaxValue} requests.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height,
            containerHeight: event.currentTarget.parentElement?.getBoundingClientRect().height ?? rect.height });
          const x = (event.clientX - rect.left) / rect.width * width;
          setSelectedIndex(coordinates.reduce((best, point, index) =>
            Math.abs(point.x - x) < Math.abs(coordinates[best].x - x) ? index : best, 0));
        }}
        onPointerLeave={() => { setSelectedIndex(null); setCursor(null); }}
        className="usage-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = top + chartHeight * step;
          const value = Math.round(roundedMax * (1 - step));
          return (
            <g key={step}>
              <line className="chart-gridline" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-axis-label" textAnchor="end" x={left - 9} y={y + 4}>
                {compactFormatter.format(value)}
              </text>
            </g>
          );
        })}
        {lines.map(({ service, coordinates: points, path }) => (
          <g key={service} aria-label={service === "all" ? "All services combined" : serviceLabel(service, products)}>
            {path ? <path className="chart-line" data-service={service} d={path} style={{ stroke: color(service) }} /> : null}
            {points.map((point, index) => (
              <circle className="chart-point" style={{ fill: "white", stroke: color(service) }}
                cx={point.x} cy={point.y} key={available[index].date} r="2.0"
                aria-label={`${formatTimestamp(available[index].date)} · ${service === "all" ? "All services" : serviceLabel(service, products)}: ${service === "all" ? available[index].total : available[index][service]} requests`} />
            ))}
          </g>
        ))}
        {selectedIndex !== null && active && coordinates[activeIndex] ? (
          <g aria-hidden="true">
            <line className="chart-crosshair" x1={coordinates[activeIndex].x} x2={coordinates[activeIndex].x} y1={top} y2={top + chartHeight} />
            {lines.map(({ service, coordinates: points }) => (
              <circle key={service} className="chart-active-point" style={{ stroke: color(service) }} cx={points[activeIndex].x} cy={points[activeIndex].y} r="5" />
            ))}
          </g>
        ) : null}
        {ticks.map((timestamp, index) => (
          <text className="chart-axis-label chart-date-label" key={timestamp}
            textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
            x={left + index / Math.max(1, ticks.length - 1) * chartWidth} y={height - 5}>
            {formatBucket(new Date(timestamp).toISOString(), bucketMinutes)}
          </text>
        ))}
      </svg>
      {active ? (
        <div ref={inspectorRef} className={`chart-inspector chart-hover-details${cursor ? " chart-cursor-tooltip" : ""}`}
          style={cursor ? { ...tooltipPosition(cursor, inspectorSize), width: Math.min(280, Math.max(0, cursor.width - 16)) } : undefined}>
          {!cursor ? <p className="chart-inspector-hint">{selectedIndex === null ? "Latest interval" : "Selected interval"} · Hover over the graph or use arrow keys to explore.</p> : null}
          <div className="chart-inspector-summary" aria-live="polite" aria-atomic="true">
            <time dateTime={active.date}>{formatTimestamp(active.date)} – {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(Math.min(new Date(active.date).getTime() + bucketMinutes * 60000, new Date(sampledAt).getTime())))}</time>
            <strong>{numberFormatter.format(active.total)} requests · {includeTotal ? "All services" : "All statuses"}</strong>
          </div>
          {!cursor ? <p className="analytics-period">{includeTotal ? "All services" : "Statuses"} in this interval</p> : null}
          <div className="chart-inspector-services">
            {SERVICES.map((type) => <span key={type}><i className={`legend-dot legend-dot--${type}`} style={{ background: color(type) }} />{serviceLabel(type, products)} <strong>{numberFormatter.format(Number(active[type] ?? 0))}</strong></span>)}
          </div>
        </div>
      ) : !available.length ? <p className="empty-row">No intervals available yet.</p> : null}
    </div>
  );
}

export const STATUS_COLORS: Record<string, string> = {
  received: "#64748b", validating: "#0891b2", waiting_capacity: "#a16207",
  queued: "#d97706", leased: "#9333ea", running: "#0284c7", retry_wait: "#ea580c",
  cancel_requested: "#be185d", lease_expired: "#854d0e", orphaned: "#475569",
  submission_unknown: "#4f46e5", succeeded: "#059669", failed: "#dc2626",
  cancelled: "#db2777", expired: "#78716c",
};
export function statusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function ServiceStatusChart({ statuses, serviceName, ...props }: {
  statuses: string[]; serviceName: string; series: UsagePoint[]; bucketMinutes: number;
  sampledAt: string; periodStart: string; periodEnd: string;
}) {
  const available = props.series.filter((point) => new Date(point.date).getTime() <= new Date(props.sampledAt).getTime());
  const succeeded = available.reduce((sum, point) => sum + Number(point.succeeded ?? 0), 0);
  const total = available.reduce((sum, point) => sum + point.total, 0);
  const successPercentage = total > 0 ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(succeeded / total * 100)}%` : "—";
  const plottedStatuses = statuses.filter((status) => available.some((point) => Number(point[status] ?? 0) > 0));
  const series = props.series.map((point) => ({
    date: point.date, total: point.total,
    ...Object.fromEntries(plottedStatuses.map((status) => [status, Number(point[status] ?? 0)])),
  }));
  return <article className="overview-card usage-service-chart service-status-card">
    <div className="service-status-header">
      <h3 className="card-title">{serviceName}</h3>
      <div className="service-success-rate">
        <span>Success</span><strong>{successPercentage}</strong>
      </div>
    </div>
    <p className="card-description">{numberFormatter.format(succeeded)} succeeded / {numberFormatter.format(total)} generations · Includes pending requests</p>
    <div className="graph-legend status-chart-legend">
      {plottedStatuses.map((status) => <span className="legend-item" key={status}>
        <i className="legend-dot" style={{ background: STATUS_COLORS[status] ?? serviceColor(status) }} />
        {statusLabel(status)}
      </span>)}
    </div>
    {plottedStatuses.length ? <UsageChart {...props} series={series} compact includeTotal={false} colors={STATUS_COLORS}
      chartLabel={`${serviceName} generation statuses`}
      products={plottedStatuses.map((status) => ({ code: status, name: statusLabel(status) }))} />
      : <p className="empty-row">No generation activity in the plotted intervals.</p>}
  </article>;
}


export function ProductShareCard({ series, sampledAt, products, loading = false }: {
  series: UsagePoint[]; sampledAt: string; products: Array<{ code: string; name: string }>; loading?: boolean;
}) {
  const counts: Record<string, number> = {};
  for (const point of series) {
    if (new Date(point.date).getTime() > new Date(sampledAt).getTime()) continue;
    for (const [code, count] of Object.entries(point)) {
      if (code !== "date" && code !== "total") counts[code] = (counts[code] ?? 0) + Number(count);
    }
  }
  const shares = Object.entries(counts).filter(([, count]) => count > 0)
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b));
  const total = shares.reduce((sum, [, count]) => sum + count, 0);
  const circumference = 2 * Math.PI * 44;
  const percentage = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  return <article className="kpi-card product-share-card" aria-label="Product share of succeeded generations">
    <div className="kpi-top"><h2 className="kpi-label">Product Share</h2></div>
    {loading ? <p className="card-description">Loading product share…</p> : total === 0 ?
      <p className="card-description">No succeeded generations in this window.</p> : <>
        <div className="product-share-body">
          <svg className="product-share-donut" viewBox="0 0 128 128" role="img"
            aria-label={`${numberFormatter.format(total)} succeeded generations. ${shares.map(([code, count]) => `${serviceLabel(code, products)}: ${percentage.format(count / total)}`).join(". ")}`}>
            {shares.map(([code, count], index) => {
              const length = count / total * circumference;
              const segmentOffset = shares.slice(0, index).reduce((sum, [, value]) => sum + value, 0) / total * circumference;
              return <circle key={code} data-product={code} cx="64" cy="64" r="44" fill="none"
                stroke={serviceColor(code)} strokeWidth="18" strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-segmentOffset} transform="rotate(-90 64 64)">
                <title>{`${serviceLabel(code, products)}: ${numberFormatter.format(count)} (${percentage.format(count / total)})`}</title>
              </circle>;
            })}
            <text className="product-share-total" x="64" y="63" textAnchor="middle">{compactFormatter.format(total)}</text>
            <text className="product-share-caption" x="64" y="78" textAnchor="middle">succeeded</text>
          </svg>
          <ul className="product-share-legend">
            {shares.map(([code, count]) => <li key={code}>
              <i className="legend-dot" style={{ background: serviceColor(code) }} />
              <span>{serviceLabel(code, products)}</span>
              <strong title={`${numberFormatter.format(count)} succeeded generations`}>{percentage.format(count / total)}</strong>
            </li>)}
          </ul>
        </div>
        <div className="kpi-footer"><span className="kpi-detail">Succeeded only · Selected window</span></div>
      </>}
  </article>;
}
