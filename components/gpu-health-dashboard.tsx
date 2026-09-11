"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AlertIcon, CheckIcon, GpuIcon, RefreshIcon } from "@/components/icons";
import { ApiError, getGpuHealth, type GpuHealthSnapshot } from "@/lib/api";

const REFRESH_INTERVAL_MS = 15_000;

function formatTimestamp(value: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function displayError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "GPU health is temporarily unavailable.";
}

function FeatureStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className={`gpu-feature-status ${enabled ? "is-enabled" : "is-disabled"}`}>
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

export function GpuHealthDashboard() {
  const requestInFlight = useRef(false);
  const [snapshot, setSnapshot] = useState<GpuHealthSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (background = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (!background) setRefreshing(true);
    try {
      const next = await getGpuHealth();
      setSnapshot(next);
      setError("");
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
      requestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(true), REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  if (loading && !snapshot) {
    return (
      <div aria-busy="true" aria-label="Loading GPU health" className="gpu-health-page">
        <div className="skeleton skeleton--gpu-hero" />
        <div className="gpu-metric-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton skeleton--gpu-metric" key={index} />
          ))}
        </div>
        <div className="gpu-panel-grid">
          <div className="skeleton skeleton--gpu-panel" />
          <div className="skeleton skeleton--gpu-panel" />
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="gpu-health-page">
        <section className="gpu-empty-state" role="alert">
          <span className="state-icon state-icon--error"><AlertIcon /></span>
          <p className="section-kicker">Status unavailable</p>
          <h1>GPU health could not be loaded</h1>
          <p>{error}</p>
          <button className="button button--primary" disabled={refreshing} onClick={() => void refresh()} type="button">
            <RefreshIcon className={refreshing ? "spin" : undefined} />
            {refreshing ? "Refreshing…" : "Try again"}
          </button>
        </section>
      </div>
    );
  }

  const { capacity, scheduler } = snapshot;
  const activeSlots = Math.max(0, capacity.healthy_slots - capacity.free_slots);
  const utilization = capacity.healthy_slots > 0
    ? Math.min(100, Math.round((activeSlots / capacity.healthy_slots) * 100))
    : 0;
  const operational = capacity.available && capacity.healthy_slots > 0;
  const configuredCapacity = scheduler.source === "configured";
  const state = !operational
    ? "Unavailable"
    : configuredCapacity
      ? "Configured capacity"
      : capacity.free_slots === 0
        ? "At capacity"
        : "Operational";
  const stateTone = !operational
    ? "is-offline"
    : configuredCapacity || capacity.free_slots === 0
      ? "is-warning"
      : "is-online";

  return (
    <div className="gpu-health-page">
      <section className="gpu-health-hero">
        <div className="gpu-health-heading">
          <span className="eyebrow-badge">Infrastructure overview</span>
          <h1>GPU health</h1>
          <p>Live capacity and scheduler readiness for video generation workloads.</p>
        </div>
        <div className="gpu-health-actions">
          <div aria-live="polite" className={`gpu-live-status ${stateTone}`}>
            <span className="gpu-live-dot" />
            <span>
              <strong>{state}</strong>
              <small>Updated {formatTimestamp(capacity.observed_at)}</small>
            </span>
          </div>
          <button className="button button--secondary" disabled={refreshing} onClick={() => void refresh()} type="button">
            <RefreshIcon className={refreshing ? "spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="gpu-inline-alert" role="alert">
          <AlertIcon />
          <span><strong>Refresh failed.</strong> Showing the last available snapshot. {error}</span>
        </div>
      ) : null}

      <section aria-label="GPU capacity metrics" className="gpu-metric-grid">
        <article className="gpu-metric-card">
          <span className="gpu-metric-label">Healthy slots</span>
          <strong>{capacity.healthy_slots.toLocaleString()}</strong>
          <small>Ready to accept or process work</small>
        </article>
        <article className="gpu-metric-card is-active">
          <span className="gpu-metric-label">Active slots</span>
          <strong>{activeSlots.toLocaleString()}</strong>
          <small>Healthy slots currently occupied</small>
        </article>
        <article className="gpu-metric-card is-free">
          <span className="gpu-metric-label">Free slots</span>
          <strong>{capacity.free_slots.toLocaleString()}</strong>
          <small>Immediately available capacity</small>
        </article>
        <article className="gpu-metric-card is-queue">
          <span className="gpu-metric-label">Queue depth</span>
          <strong>{capacity.queue_depth === null ? "—" : capacity.queue_depth.toLocaleString()}</strong>
          <small>{capacity.queue_depth === null ? "Not reported by scheduler" : "Jobs waiting for capacity"}</small>
        </article>
      </section>

      <section className="gpu-panel-grid">
        <article className="gpu-panel gpu-capacity-panel">
          <header className="gpu-panel-header">
            <span className="gpu-panel-icon"><GpuIcon /></span>
            <div>
              <p className="section-kicker">Pool utilization</p>
              <h2>Healthy GPU capacity</h2>
            </div>
            <strong className="gpu-utilization-value">{utilization}%</strong>
          </header>
          <div
            aria-label={`${utilization}% of healthy GPU slots are active`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={utilization}
            className="gpu-capacity-track"
            role="progressbar"
          >
            <span style={{ width: `${utilization}%` }} />
          </div>
          <div className="gpu-capacity-legend">
            <span><i className="is-active" />Active <strong>{activeSlots}</strong></span>
            <span><i className="is-free" />Free <strong>{capacity.free_slots}</strong></span>
          </div>
          <div className="gpu-availability-row">
            <span className={`gpu-availability-icon ${operational ? "is-online" : "is-offline"}`}>
              {operational ? <CheckIcon /> : <AlertIcon />}
            </span>
            <span>
              <strong>
                {!operational
                  ? "GPU pool is unavailable"
                  : configuredCapacity
                    ? "Configured capacity only"
                    : "GPU pool is available"}
              </strong>
              <small>
                {!operational
                  ? "No healthy GPU capacity is currently being reported."
                  : configuredCapacity
                    ? "The scheduler proxy is not configured, so live free-slot health is unavailable."
                    : `${capacity.free_slots} of ${capacity.healthy_slots} healthy slots can accept work now.`}
              </small>
            </span>
          </div>
        </article>

        <article className="gpu-panel">
          <header className="gpu-panel-header">
            <div>
              <p className="section-kicker">Control plane</p>
              <h2>Scheduler configuration</h2>
            </div>
          </header>
          <dl className="gpu-detail-list">
            <div><dt>Mode</dt><dd><span className="gpu-code-badge">{scheduler.mode}</span></dd></div>
            <div><dt>Video job API</dt><dd><FeatureStatus enabled={scheduler.api_enabled} /></dd></div>
            <div><dt>Worker lease API</dt><dd><FeatureStatus enabled={scheduler.worker_lease_api_enabled} /></dd></div>
            <div><dt>Policy version</dt><dd><code>{scheduler.policy_version}</code></dd></div>
            <div><dt>Capacity source</dt><dd><code>{scheduler.source || "Not reported"}</code></dd></div>
            <div><dt>Observed at</dt><dd>{formatTimestamp(capacity.observed_at)}</dd></div>
          </dl>
        </article>
      </section>

      <p className="gpu-refresh-note">This screen refreshes automatically every 15 seconds.</p>
    </div>
  );
}
