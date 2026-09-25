"use client";

import { useState } from "react";

export type UsagePoint = {
  date: string; total: number; image: number; image2image: number; tts: number; video: number;
};
export const SERVICES = ["image", "image2image", "tts", "video"] as const;
export const SERVICE_COLORS = { all: "#02492a", image: "#0284c7", image2image: "#d97706", tts: "#059669", video: "#7c3aed" };
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

export function UsageChart({ series, bucketMinutes, sampledAt, periodStart, periodEnd }: {
  series: UsagePoint[]; bucketMinutes: number; sampledAt: string; periodStart: string; periodEnd: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const available = series.filter((point) => new Date(point.date).getTime() <= new Date(sampledAt).getTime());
  const start = new Date(periodStart).getTime();
  const end = Math.max(start, new Date(periodEnd).getTime());
  const duration = Math.max(1, end - start);
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
  const actualMaxValue = Math.max(0, ...available.map((point) => point.total));
  // Use whole-request ticks and let sparse activity occupy visible chart space.
  const tickStep = Math.max(1, Math.ceil(actualMaxValue / 4));
  const roundedMax = tickStep * 4;
  const lines = (["all", ...SERVICES] as const).map((service) => {
    const coordinates = available.map((point) => ({
      x: left + ((new Date(point.date).getTime() - start) / duration) * chartWidth,
      y: top + chartHeight - ((service === "all" ? point.total : point[service]) / roundedMax) * chartHeight,
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
  const coordinates = lines[0].coordinates;
  const ticks = end > start ? [start, start + (end - start) / 2, end] : [start];

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
        aria-label={`Combined and individual service request volume. Peak interval: ${actualMaxValue} requests.`}
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
        {lines.map(({ service, coordinates: points, path }) => (
          <g key={service} aria-label={service === "all" ? "All services combined" : serviceLabel(service)}>
            {path ? <path className="chart-line" data-service={service} d={path} style={{ stroke: SERVICE_COLORS[service] }} /> : null}
            {points.map((point, index) => (
              <circle className="chart-point" style={{ fill: "white", stroke: SERVICE_COLORS[service] }}
                cx={point.x} cy={point.y} key={available[index].date} r="2.7">
                <title>{`${formatTimestamp(available[index].date)} · ${service === "all" ? "All services" : serviceLabel(service)}: ${service === "all" ? available[index].total : available[index][service]} requests`}</title>
              </circle>
            ))}
          </g>
        ))}
        {selectedIndex !== null && active && coordinates[activeIndex] ? (
          <g aria-hidden="true">
            <line className="chart-crosshair" x1={coordinates[activeIndex].x} x2={coordinates[activeIndex].x} y1={top} y2={top + chartHeight} />
            {lines.map(({ service, coordinates: points }) => (
              <circle key={service} className="chart-active-point" style={{ stroke: SERVICE_COLORS[service] }} cx={points[activeIndex].x} cy={points[activeIndex].y} r="5" />
            ))}
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
            <strong>{numberFormatter.format(active.total)} requests · All services</strong>
          </div>
          <p className="analytics-period">All services in this interval</p>
          <div className="chart-inspector-services">
            {SERVICES.map((type) => <span key={type}><i className={`legend-dot legend-dot--${type}`} style={{ background: SERVICE_COLORS[type] }} />{serviceLabel(type)} <strong>{numberFormatter.format(active[type])}</strong></span>)}
          </div>
        </div>
      ) : !available.length ? <p className="empty-row">No intervals available yet.</p> : null}
    </div>
  );
}

