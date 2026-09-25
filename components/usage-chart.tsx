"use client";

import { useState } from "react";

export type UsagePoint = {
  date: string; total: number; image: number; image2image: number; tts: number; video: number;
};
export const SERVICES = ["image", "image2image", "tts", "video"] as const;
type ServiceFilter = "all" | (typeof SERVICES)[number];
const SERVICE_COLORS = { all: "#078a52", image: "#0284c7", image2image: "#d97706", tts: "#059669", video: "#7c3aed" };
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
export function serviceLabel(value?: string): string {
  if (value === "tts") return "Text to speech";
  if (value === "video") return "Video";
  if (value === "image2image") return "Image to image";
  return "Text to image";
}
export function UsageWindow({ start, end }: { start: string; end: string }) {
  return <div className="usage-window">
    <p>Local ({Intl.DateTimeFormat().resolvedOptions().timeZone}): {formatTimestamp(start)} – {formatTimestamp(end)}</p>
    <p>UTC: {formatTimestamp(start, "UTC")} – {formatTimestamp(end, "UTC")}</p>
  </div>;
}

export function UsageChart({ series, service, bucketMinutes, sampledAt, periodStart, periodEnd }: {
  series: UsagePoint[]; service: ServiceFilter; bucketMinutes: number; sampledAt: string; periodStart: string; periodEnd: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const available = series.filter((point) => new Date(point.date).getTime() <= new Date(sampledAt).getTime());
  const start = new Date(periodStart).getTime();
  const end = Math.max(start, new Date(periodEnd).getTime());
  const duration = Math.max(1, end - start);
  const valueOf = (point: UsagePoint) => service === "all" ? point.total : point[service];
  const activeIndex = Math.min(selectedIndex ?? Math.max(0, available.length - 1), Math.max(0, available.length - 1));
  const active = available[activeIndex];
  const width = 780;
  const height = 248;
  const left = 38;
  const right = 14;
  const top = 18;
  const bottom = 32;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const actualMaxValue = Math.max(0, ...available.map(valueOf));
  // Use whole-request ticks and let sparse activity occupy visible chart space.
  const tickStep = Math.max(1, Math.ceil(actualMaxValue / 4));
  const roundedMax = tickStep * 4;
  const coordinates = available.map((point) => ({
    x: left + ((new Date(point.date).getTime() - start) / duration) * chartWidth,
    y: top + chartHeight - (valueOf(point) / roundedMax) * chartHeight,
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const ticks = end > start ? [start, start + (end - start) / 2, end] : [start];
  const color = SERVICE_COLORS[service];

  return (
    <div className="usage-chart-wrap" tabIndex={0} role="group"
      aria-label="Interactive request chart. Use arrow keys to explore intervals."
      onPointerLeave={() => setSelectedIndex(null)}
      onBlur={() => setSelectedIndex(null)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Escape") setSelectedIndex(null);
        else setSelectedIndex(event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : Math.max(0, Math.min(available.length - 1, activeIndex + (event.key === "ArrowRight" ? 1 : -1))));
      }}>

      <svg
        aria-label={`${service === "all" ? "All services" : serviceLabel(service)} request volume. Peak interval: ${actualMaxValue} requests.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width * width;
          setSelectedIndex(coordinates.reduce((best, point, index) =>
            Math.abs(point.x - x) < Math.abs(coordinates[best].x - x) ? index : best, 0));
        }}
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
        {linePath ? <path className="chart-line" d={linePath} style={{ stroke: color }} /> : null}
        {coordinates.map((point, index) => (
          <circle className="chart-point" style={{ fill: color }} cx={point.x} cy={point.y} key={available[index].date} r="2.7">
            <title>{`${formatTimestamp(available[index].date)}: ${valueOf(available[index])} requests`}</title>
          </circle>
        ))}
        {selectedIndex !== null && active && coordinates[activeIndex] ? (
          <g aria-hidden="true">
            <line className="chart-crosshair" x1={coordinates[activeIndex].x} x2={coordinates[activeIndex].x} y1={top} y2={top + chartHeight} />
            <circle className="chart-active-point" cx={coordinates[activeIndex].x} cy={coordinates[activeIndex].y} r="5" />
          </g>
        ) : null}
        {ticks.map((timestamp, index) => (
          <text className="chart-axis-label chart-date-label" key={timestamp}
            textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}
            x={left + (timestamp - start) / duration * chartWidth} y={height - 5}>
            {formatBucket(new Date(timestamp).toISOString(), bucketMinutes)}
          </text>
        ))}
      </svg>
      {selectedIndex !== null && active ? (
        <div className="chart-inspector chart-hover-details">
          <div className="chart-inspector-summary" aria-live="polite" aria-atomic="true">
            <time dateTime={active.date}>{formatTimestamp(active.date)} – {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(Math.min(new Date(active.date).getTime() + bucketMinutes * 60000, new Date(sampledAt).getTime())))}</time>
            <strong>{numberFormatter.format(valueOf(active))} requests · {service === "all" ? "All services" : serviceLabel(service)}</strong>
          </div>
          {service !== "all" && valueOf(active) === 0 && active.total > 0 ? (
            <p className="analytics-period">This interval has activity in other services.</p>
          ) : null}
          <p className="analytics-period">All services in this interval</p>
          <div className="chart-inspector-services">
            {SERVICES.map((type) => <span key={type}><i className={`legend-dot legend-dot--${type}`} style={{ background: SERVICE_COLORS[type] }} />{serviceLabel(type)} <strong>{numberFormatter.format(active[type])}</strong></span>)}
          </div>
        </div>
      ) : !available.length ? <p className="empty-row">No intervals available yet.</p> : null}
    </div>
  );
}

