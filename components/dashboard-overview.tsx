"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  getOverviewTimeline,
  getOverviewUserStats,
  getOverviewProducts,
  type OverviewTimeWindow,
  type OverviewTimelineResponse,
  type OverviewUserStatsResponse,
  type OverviewProduct,
  type OverviewUserStat,
} from "@/lib/api";
import {
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
  CloseIcon,
  VelocityIcon,
  ProductIcon,
} from "@/components/icons";

import { UsageChart, UsageWindow, SERVICES, SERVICE_COLORS, formatTimestamp, serviceLabel } from "@/components/usage-chart";

// Product badges configuration
const PRODUCT_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  image: { bg: "rgba(14, 165, 233, 0.12)", text: "#0369a1", dot: "#0284c7", label: "Image" },
  tts: { bg: "rgba(16, 185, 129, 0.12)", text: "#047857", dot: "#059669", label: "TTS" },
  video: { bg: "rgba(139, 92, 246, 0.12)", text: "#6d28d9", dot: "#7c3aed", label: "Video" },
  image2image: { bg: "rgba(245, 158, 11, 0.12)", text: "#b45309", dot: "#d97706", label: "Img2Img" },
};

// Plan badge colors
function getPlanStyle(planCode: string): { bg: string; text: string; border: string } {
  const code = (planCode || "").toLowerCase();
  if (code.includes("business")) {
    return { bg: "rgba(99, 102, 241, 0.12)", text: "#4338ca", border: "rgba(99, 102, 241, 0.28)" };
  }
  if (code.includes("pro_plus") || code.includes("creator")) {
    return { bg: "rgba(14, 165, 233, 0.12)", text: "#0369a1", border: "rgba(14, 165, 233, 0.28)" };
  }
  if (code.includes("pro")) {
    return { bg: "rgba(16, 185, 129, 0.12)", text: "#047857", border: "rgba(16, 185, 129, 0.28)" };
  }
  if (code.includes("trial")) {
    return { bg: "rgba(245, 158, 11, 0.12)", text: "#b45309", border: "rgba(245, 158, 11, 0.28)" };
  }
  return { bg: "rgba(107, 114, 128, 0.10)", text: "#4b5563", border: "rgba(107, 114, 128, 0.22)" };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DashboardOverview() {
  // Filters state
  const [timeWindow, setTimeWindow] = useState<OverviewTimeWindow>("current_window");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [availableProducts, setAvailableProducts] = useState<OverviewProduct[]>([
    { code: "all", name: "All Products" },
  ]);

  // Data states
  const [timeline, setTimeline] = useState<OverviewTimelineResponse | null>(null);
  const [userStats, setUserStats] = useState<OverviewUserStatsResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table pagination & search
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [orderBy, setOrderBy] = useState("generation_count");
  const [descending, setDescending] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);

  // Live auto-refresh
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(15);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch products once on mount
  useEffect(() => {
    let active = true;
    getOverviewProducts()
      .then((res) => {
        if (active && res.products) {
          setAvailableProducts(res.products);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Main data loader effect
  useEffect(() => {
    let active = true;
    const tzOffset = new Date().getTimezoneOffset();

    const loadData = async () => {
      try {
        const [tData, uData] = await Promise.all([
          getOverviewTimeline({
            timeWindow,
            product: selectedProduct,
            tzOffset,
          }),
          getOverviewUserStats({
            timeWindow,
            product: selectedProduct,
            tzOffset,
            page,
            pageSize,
            search: debouncedSearch,
            orderBy,
            descending,
            activeOnly,
          }),
        ]);

        if (active) {
          setTimeline(tData);
          setUserStats(uData);
          setError(null);
          setLoadingTimeline(false);
          setLoadingUsers(false);
          setLastUpdated(new Date());
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load telemetry.");
          setLoadingTimeline(false);
          setLoadingUsers(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [
    timeWindow,
    selectedProduct,
    page,
    pageSize,
    debouncedSearch,
    orderBy,
    descending,
    activeOnly,
  ]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const tzOffset = new Date().getTimezoneOffset();
    try {
      const [tData, uData] = await Promise.all([
        getOverviewTimeline({
          timeWindow,
          product: selectedProduct,
          tzOffset,
        }),
        getOverviewUserStats({
          timeWindow,
          product: selectedProduct,
          tzOffset,
          page,
          pageSize,
          search: debouncedSearch,
          orderBy,
          descending,
          activeOnly,
        }),
      ]);
      setTimeline(tData);
      setUserStats(uData);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }, [timeWindow, selectedProduct, page, pageSize, debouncedSearch, orderBy, descending, activeOnly]);

  // Set up live auto-refresh timer
  useEffect(() => {
    if (refreshIntervalSec <= 0) return;
    const interval = setInterval(() => {
      const tzOffset = new Date().getTimezoneOffset();
      Promise.all([
        getOverviewTimeline({
          timeWindow,
          product: selectedProduct,
          tzOffset,
        }),
        getOverviewUserStats({
          timeWindow,
          product: selectedProduct,
          tzOffset,
          page,
          pageSize,
          search: debouncedSearch,
          orderBy,
          descending,
          activeOnly,
        }),
      ])
        .then(([tData, uData]) => {
          setTimeline(tData);
          setUserStats(uData);
          setLastUpdated(new Date());
        })
        .catch(() => {});
    }, refreshIntervalSec * 1000);

    return () => clearInterval(interval);
  }, [refreshIntervalSec, timeWindow, selectedProduct, page, pageSize, debouncedSearch, orderBy, descending, activeOnly]);

  const chartSeries = useMemo(() => (timeline?.points ?? []).map((point) => ({
    date: point.timestamp, total: point.count,
    image: point.breakdown.image ?? 0, image2image: point.breakdown.image2image ?? 0,
    tts: point.breakdown.tts ?? 0, video: point.breakdown.video ?? 0,
  })), [timeline]);
  const sampledAt = timeline ? new Date(Math.min(lastUpdated.getTime(), new Date(timeline.end_time).getTime())).toISOString() : "";

  // Most active product calculation for summary card
  const topProductSummary = useMemo(() => {
    if (!timeline?.points || timeline.points.length === 0) return { name: "None", count: 0 };
    const totals: Record<string, number> = {};
    timeline.points.forEach((pt) => {
      Object.entries(pt.breakdown || {}).forEach(([code, count]) => {
        totals[code] = (totals[code] || 0) + count;
      });
    });
    let topCode = "image";
    let topCount = 0;
    Object.entries(totals).forEach(([code, cnt]) => {
      if (cnt > topCount) {
        topCount = cnt;
        topCode = code;
      }
    });
    const pInfo = availableProducts.find((p) => p.code === topCode);
    return { name: pInfo?.name || topCode.toUpperCase(), count: topCount };
  }, [timeline, availableProducts]);

  return (
    <div className="overview-container">
      {/* ── TOP HERO BAR & LIVE CONTROLS ── */}
      <header className="overview-hero">
        <div className="overview-hero-left">
          <div className="overview-eyebrow-row">
            <span className="overview-eyebrow">Generation Telemetry</span>
            <div className="overview-live-indicator" title="Live telemetry auto-refreshes">
              <span className={`live-pulse-dot ${refreshIntervalSec > 0 ? "is-pulsing" : "is-paused"}`} />
              <span className="live-label">{refreshIntervalSec > 0 ? "LIVE" : "PAUSED"}</span>
            </div>
          </div>
          <h1 className="overview-title">Generation Overview</h1>
          <p className="overview-subtitle">
            Live generation throughput, UTC quota-window performance, and customer usage statistics.
          </p>
        </div>

        <div className="overview-hero-right">
          <div className="overview-controls-group">
            <div className="overview-auto-refresh">
              <span className="control-label">Interval:</span>
              <select
                aria-label="Auto-refresh interval"
                className="overview-select"
                value={refreshIntervalSec}
                onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
              >
                <option value={10}>10s</option>
                <option value={15}>15s (Default)</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={0}>Paused</option>
              </select>
            </div>

            <button
              className={`overview-btn-refresh ${isRefreshing ? "is-loading" : ""}`}
              onClick={() => void handleManualRefresh()}
              title="Refresh telemetry now"
              type="button"
            >
              <RefreshIcon size={16} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="overview-timestamp-note">
            Updated {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* ── FILTER CONTROLS BAR ── */}
      <section aria-label="Overview Filters" className="overview-filter-bar">
        {/* Time Window Tabs */}
        <div className="overview-window-tabs" role="tablist">
          <button
            className={`window-tab ${timeWindow === "current_window" ? "is-active" : ""}`}
            onClick={() => {
              setTimeWindow("current_window");
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            <span className="tab-title">Current Window</span>
            <span className="tab-sub">
              {timeline?.time_window === "current_window" && timeline?.window_label
                ? timeline.window_label.replace("Current Window", "").replace(/[()]/g, "").trim()
                : "4-Hour Slot"}
            </span>
          </button>

          <button
            className={`window-tab ${timeWindow === "24h" ? "is-active" : ""}`}
            onClick={() => {
              setTimeWindow("24h");
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            <span className="tab-title">Last 24 Hours</span>
            <span className="tab-sub">Hourly Resolution</span>
          </button>

          <button
            className={`window-tab ${timeWindow === "7d" ? "is-active" : ""}`}
            onClick={() => {
              setTimeWindow("7d");
              setPage(1);
            }}
            role="tab"
            type="button"
          >
            <span className="tab-title">Last 7 Days</span>
            <span className="tab-sub">Weekly Trend</span>
          </button>
        </div>

        {/* Product Filter Selector */}
        <div className="overview-product-filter">
          <label className="filter-label" htmlFor="product-filter-select">
            Product:
          </label>
          <select
            className="overview-select product-select"
            id="product-filter-select"
            value={selectedProduct}
            onChange={(e) => {
              setSelectedProduct(e.target.value);
              setPage(1);
            }}
          >
            {availableProducts.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── KPI METRICS STRIP ── */}
      <section aria-label="Key Telemetry Metrics" className="overview-kpi-grid">
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Total Generations</span>
            <span className="kpi-icon-wrap">
              <SparklesIcon size={18} />
            </span>
          </div>
          <div className="kpi-value">
            {loadingTimeline ? "…" : (timeline?.total_generations ?? 0).toLocaleString()}
          </div>
          <div className="kpi-footer">
            <span className="kpi-badge">
              {timeWindow === "current_window" ? "Current UTC Window" : timeWindow === "24h" ? "Past 24 Hours" : "Past 7 Days"}
            </span>
            <span className="kpi-detail">
              {selectedProduct === "all" ? "All Products" : selectedProduct.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Peak Velocity</span>
            <span className="kpi-icon-wrap is-accent">
              <VelocityIcon size={18} />
            </span>
          </div>
          <div className="kpi-value">
            {loadingTimeline ? "…" : (timeline?.peak_count ?? 0).toLocaleString()}
          </div>
          <div className="kpi-footer">
            <span className="kpi-badge is-accent">
              {timeWindow === "current_window" ? "Per 10m bin" : timeWindow === "24h" ? "Per hour" : "Per 6h bin"}
            </span>
            <span className="kpi-detail">Max generation burst</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Active Users</span>
            <span className="kpi-icon-wrap">
              <UsersIcon size={18} />
            </span>
          </div>
          <div className="kpi-value">
            {loadingTimeline ? "…" : (timeline?.active_users ?? 0).toLocaleString()}
          </div>
          <div className="kpi-footer">
            <span className="kpi-badge">Unique Customers</span>
            <span className="kpi-detail">Generating in window</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Top Product</span>
            <span className="kpi-icon-wrap is-product">
              <ProductIcon size={18} />
            </span>
          </div>
          <div className="kpi-value kpi-product-name">
            {loadingTimeline ? "…" : topProductSummary.name}
          </div>
          <div className="kpi-footer">
            <span className="kpi-badge is-product">
              {loadingTimeline ? "…" : `${topProductSummary.count.toLocaleString()} calls`}
            </span>
            <span className="kpi-detail">Largest throughput share</span>
          </div>
        </div>
      </section>

      {/* ── LIVE GENERATION GRAPH ── */}
      <section aria-labelledby="live-graph-heading" className="overview-card overview-graph-card">
        <div className="overview-card-header">
          <div>
            <span className="card-kicker">Time vs Count</span>
            <h2 className="card-title" id="live-graph-heading">
              Generation Throughput
            </h2>
            <p className="card-description">
              {timeline?.window_label || "Selected timeframe"}
              {selectedProduct !== "all" && ` • Filtered to ${selectedProduct.toUpperCase()}`}
            </p>
          </div>

          <div className="graph-legend">
            {(["all", ...SERVICES] as const).map((service) => (
              <div className="legend-item" key={service}>
                <span className="legend-dot" style={{ background: SERVICE_COLORS[service] }} />
                <span>{service === "all" ? "All services" : serviceLabel(service)}</span>
              </div>
            ))}
          </div>
        </div>
        {timeline ? <UsageWindow start={timeline.start_time} end={timeline.end_time} /> : null}

        {error ? (
          <div className="overview-error-state">
            <p>{error}</p>
            <button className="button" onClick={() => void handleManualRefresh()} type="button">
              Retry
            </button>
          </div>
        ) : (
          timeline ? <div className="overview-graph-wrapper usage-service-chart">
            <UsageChart key={`${timeWindow}-${selectedProduct}`} series={chartSeries} periodStart={timeline.start_time} periodEnd={timeline.end_time} sampledAt={sampledAt}
              bucketMinutes={timeline.time_window === "7d" ? 360 : timeline.time_window === "24h" ? 60 : 10} />
          </div> : <p>Loading usage charts…</p>
        )}
        {timeline ? <p className="card-description">As of {formatTimestamp(sampledAt)} · Axis times are local</p> : null}
      </section>

      {/* ── USER STATISTICS TABLE ── */}
      <section aria-labelledby="user-stats-heading" className="overview-card overview-table-card">
        <div className="overview-card-header">
          <div>
            <span className="card-kicker">Customer Breakdown</span>
            <h2 className="card-title" id="user-stats-heading">
              User Generation Statistics
            </h2>
            <p className="card-description">
              Users ranked by generation volume for {timeline?.window_label || "the current window"}
              {selectedProduct !== "all" ? ` • ${selectedProduct.toUpperCase()}` : ""}.
            </p>
          </div>

          <div className="overview-table-actions">
            {/* Search Input */}
            <div className="overview-search-box">
              <SearchIcon size={16} />
              <input
                aria-label="Search users by name or email"
                className="overview-search-input"
                placeholder="Search user or email…"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  aria-label="Clear user search"
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>

            {/* Active Only Filter */}
            <label className="overview-checkbox-label">
              <input
                checked={activeOnly}
                type="checkbox"
                onChange={(e) => {
                  setActiveOnly(e.target.checked);
                  setPage(1);
                }}
              />
              <span>Active users only</span>
            </label>
          </div>
        </div>

        {/* The Data Table */}
        <div className="overview-table-wrapper">
          <table className="overview-table">
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => {
                    if (orderBy === "email") {
                      setDescending(!descending);
                    } else {
                      setOrderBy("email");
                      setDescending(false);
                    }
                  }}
                >
                  <span>User</span>
                  {orderBy === "email" && <span className="sort-arrow">{descending ? "↓" : "↑"}</span>}
                </th>

                <th
                  className="sortable"
                  onClick={() => {
                    if (orderBy === "plan") {
                      setDescending(!descending);
                    } else {
                      setOrderBy("plan");
                      setDescending(false);
                    }
                  }}
                >
                  <span>Plan</span>
                  {orderBy === "plan" && <span className="sort-arrow">{descending ? "↓" : "↑"}</span>}
                </th>

                <th
                  className="sortable is-right"
                  onClick={() => {
                    if (orderBy === "generation_count") {
                      setDescending(!descending);
                    } else {
                      setOrderBy("generation_count");
                      setDescending(true);
                    }
                  }}
                >
                  <span>Generations</span>
                  {orderBy === "generation_count" && (
                    <span className="sort-arrow">{descending ? "↓" : "↑"}</span>
                  )}
                </th>

                <th>Product Breakdown</th>

                <th
                  className="sortable is-right"
                  onClick={() => {
                    if (orderBy === "last_active") {
                      setDescending(!descending);
                    } else {
                      setOrderBy("last_active");
                      setDescending(true);
                    }
                  }}
                >
                  <span>Last Active</span>
                  {orderBy === "last_active" && (
                    <span className="sort-arrow">{descending ? "↓" : "↑"}</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={5}>
                    <div className="overview-table-loading">Loading customer statistics…</div>
                  </td>
                </tr>
              ) : !userStats || userStats.users.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="overview-table-empty">
                      <p>
                        No user generations found for the current filters (
                        <strong>{timeline?.window_label}</strong>
                        {selectedProduct !== "all" ? ` • ${selectedProduct.toUpperCase()}` : ""}).
                      </p>
                      {activeOnly && (
                        <button
                          className="button is-subtle"
                          onClick={() => setActiveOnly(false)}
                          type="button"
                        >
                          Show all registered accounts
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                userStats.users.map((u: OverviewUserStat) => {
                  const planStyle = getPlanStyle(u.plan_code);
                  const maxUserGens = userStats.users[0]?.generation_count || 1;
                  const ratio = Math.min(100, Math.round((u.generation_count / maxUserGens) * 100));

                  return (
                    <tr key={u.id}>
                      {/* User Info */}
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar" title={u.email}>
                            {(u.name || u.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="user-names">
                            <span className="user-name">{u.name || "Anonymous"}</span>
                            <span className="user-email">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Plan Badge */}
                      <td>
                        <span
                          className="overview-plan-pill"
                          style={{
                            background: planStyle.bg,
                            color: planStyle.text,
                            borderColor: planStyle.border,
                          }}
                        >
                          {u.plan_name}
                        </span>
                      </td>

                      {/* Generation Count & Mini Bar */}
                      <td className="is-right">
                        <div className="count-cell">
                          <span className="count-number">
                            {u.generation_count.toLocaleString()}
                          </span>
                          <div className="count-bar-bg" title={`${ratio}% of top user in view`}>
                            <div className="count-bar-fill" style={{ width: `${ratio}%` }} />
                          </div>
                        </div>
                      </td>

                      {/* Breakdown Pills */}
                      <td>
                        <div className="breakdown-pills">
                          {Object.entries(u.breakdown || {}).map(([code, count]) => {
                            if (count === 0) return null;
                            const color = PRODUCT_COLORS[code] || {
                              bg: "rgba(0,0,0,0.06)",
                              text: "#374151",
                              label: code,
                            };
                            return (
                              <span
                                className="product-count-pill"
                                key={code}
                                style={{ background: color.bg, color: color.text }}
                                title={`${color.label}: ${count}`}
                              >
                                {count} {color.label}
                              </span>
                            );
                          })}
                          {Object.values(u.breakdown || {}).every((c) => c === 0) && (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>

                      {/* Last Active */}
                      <td className="is-right">
                        <span
                          className="last-active-text"
                          title={u.last_active ? new Date(u.last_active).toLocaleString() : "Never"}
                        >
                          {formatRelativeTime(u.last_active)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {userStats && userStats.total_users > 0 && (
          <div className="overview-pagination">
            <div className="pagination-info">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, userStats.total_users)} of {userStats.total_users} customers
            </div>

            <div className="pagination-controls">
              <div className="page-size-selector">
                <span>Per page:</span>
                <select
                  aria-label="Rows per page"
                  className="overview-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="page-buttons">
                <button
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  Previous
                </button>
                <span className="pagination-current">
                  Page {page} of {userStats.total_pages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={page >= userStats.total_pages}
                  onClick={() => setPage((p) => Math.min(userStats.total_pages, p + 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
