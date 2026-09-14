"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GpuIcon, RefreshIcon } from "@/components/icons";
import { getGpuHealth, getGpuHistory, type GpuHealthSnapshot, type GpuHistory, type GpuReading, type MonitoredGpu } from "@/lib/api";

const LABELS: Record<GpuReading["health"], string> = { healthy: "Healthy telemetry", degraded: "Partial telemetry", stale: "Stale readings", unavailable: "Collector unavailable", identity_mismatch: "Identity mismatch" };
const PRODUCT_NAMES: Record<string, string> = { image: "Image", image_to_image: "Image to image", tts: "Text to speech", video: "Video", music: "Music" };
const RANGES = [{ label: "15 minutes", minutes: 15 }, { label: "1 hour", minutes: 60 }, { label: "24 hours", minutes: 1440 }, { label: "7 days", minutes: 10080 }];
const time = (value: string | null) => value ? new Date(value).toLocaleString() : "No sample";
const measurement = (value: number | null | undefined, unit = "") => value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
const bytes = (value: number | null | undefined) => value == null ? "—" : value >= 1073741824 ? measurement(value / 1073741824, " GiB") : measurement(value / 1048576, " MiB");
const message = (error: unknown) => error instanceof Error ? error.message : "Monitoring is temporarily unavailable.";

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <article className="gpu-metric-card"><span className="gpu-metric-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

function Chart({ title, points, value }: { title: string; points: GpuHistory["items"]; value: (point: GpuHistory["items"][number]) => number | null | undefined }) {
  const dated = points.filter((point) => point.sampled_at).map((point) => ({ point, at: Date.parse(point.sampled_at!) })).sort((a, b) => a.at - b.at);
  const start = dated[0]?.at ?? 0;
  const end = dated.at(-1)?.at ?? start;
  const segments: string[] = [];
  let drawing = false;
  let previous = 0;
  let valid = 0;
  for (const { point, at } of dated) {
    const reading = value(point);
    if (reading == null || !Number.isFinite(reading)) { drawing = false; continue; }
    if (at - previous > 60_000) drawing = false;
    const x = 35 + (end === start ? 0 : (at - start) / (end - start)) * 535;
    const y = 125 - Math.min(100, Math.max(0, reading));
    segments.push(`${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`, `l0.1,0`);
    drawing = true; previous = at; valid++;
  }
  return <article className="monitor-chart"><h3>{title}</h3>{valid ? <>
    <svg viewBox="0 0 600 150" role="img" aria-label={`${title}, 0 to 100 percent, ${valid} readings`}>
      {[0, 50, 100].map((n) => <g key={n}><line x1="35" x2="570" y1={125 - n} y2={125 - n} stroke="currentColor" opacity="0.12" /><text x="0" y={129 - n} fill="currentColor" fontSize="11">{n}%</text></g>)}
      <path d={segments.join(" ")} fill="none" stroke="var(--monitor-accent, #267953)" strokeWidth="2" strokeLinecap="round" />
    </svg><p>{time(dated[0]?.point.sampled_at ?? null)} — {time(dated.at(-1)?.point.sampled_at ?? null)}</p>
  </> : <p className="empty-state">No measurements in the loaded samples.</p>}</article>;
}

function History({ gpu }: { gpu: MonitoredGpu }) {
  const [minutes, setMinutes] = useState(15);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState<GpuHistory | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const moreController = useRef<AbortController | null>(null);
  const moreInFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);
    const timer = setTimeout(() => {
      setPage(null); setLoading(true); setError(""); setMoreBusy(false);
      void getGpuHistory(gpu.gpu_id, start.toISOString(), end.toISOString(), 0, controller.signal).then((data) => {
        if (!controller.signal.aborted) setPage(data);
      }).catch((e) => { if (!controller.signal.aborted) setError(message(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); moreController.current?.abort(); moreInFlight.current = false; };
  }, [gpu.gpu_id, minutes, version]);
  async function loadMore() {
    if (!page || page.next_after_id == null || moreInFlight.current) return;
    moreInFlight.current = true; setMoreBusy(true);
    const controller = new AbortController(); moreController.current = controller;
    try {
      const next = await getGpuHistory(gpu.gpu_id, page.start, page.end, page.next_after_id, controller.signal);
      if (!controller.signal.aborted) {
        setPage({ ...next, items: [...page.items, ...next.items] }); setError("");
      }
    } catch (e) { if (!controller.signal.aborted) setError(message(e)); }
    finally { if (!controller.signal.aborted) { setMoreBusy(false); moreInFlight.current = false; } }
  }
  const devices = new Map<string, string>();
  for (const point of page?.items ?? []) for (const device of point.metrics?.devices ?? []) devices.set(device.hardware_uuid, device.name);
  return <section className="gpu-panel monitor-history" aria-label="Resource history">
    <div className="compute-section-heading"><div><h2>Resource history</h2><p>Seven days retained on this GPU server. Samples load on demand, oldest first within the selected range.</p></div>
      <div className="monitor-controls"><label>Time range <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{RANGES.map((range) => <option value={range.minutes} key={range.minutes}>{range.label}</option>)}</select></label>
      <button type="button" className="button button--secondary" disabled={loading || moreBusy} onClick={() => setVersion((v) => v + 1)}>Refresh history</button></div>
    </div>
    {error && <p className="compute-notice compute-notice--error" role="alert">{error === "collector_history_unavailable" ? "The collector’s stored history could not be read. Check that it is reachable and supports /v1/history." : error === "collector_identity_mismatch" ? "Historical samples do not match the registered collector or GPU identity." : error}</p>}
    {loading ? <p role="status">Loading history…</p> : page && !page.items.length ? <p className="empty-state">No retained samples in this time range.</p> : page && <>
      <p>{page.items.length.toLocaleString()} samples loaded{page.next_after_id != null ? " · More samples available" : " · All available samples loaded"}. Missing measurements appear as gaps.</p>
      <div className="monitor-chart-grid"><Chart title="CPU utilization" points={page.items} value={(p) => p.metrics?.cpu_percent} /><Chart title="RAM usage" points={page.items} value={(p) => p.metrics?.memory.used_percent} />
      {[...devices].map(([id, name]) => <Chart key={id} title={`${name} · GPU utilization`} points={page.items} value={(p) => p.metrics?.devices.find((d) => d.hardware_uuid === id)?.utilization_percent} />)}</div>
      {page.next_after_id != null && <button className="button button--secondary" disabled={moreBusy} onClick={() => void loadMore()} type="button">{moreBusy ? "Loading…" : "Load next 100 samples"}</button>}
    </>}
  </section>;
}

export function GpuHealthDashboard() {
  const [snapshot, setSnapshot] = useState<GpuHealthSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string>();
  const [back, setBack] = useState<(string | undefined)[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh(initial: boolean) {
      if (controller.signal.aborted) return;
      if (initial) setLoading(true);
      try {
        if (initial || document.visibilityState === "visible") {
          const next = await getGpuHealth(controller.signal, cursor);
          if (!controller.signal.aborted) { setSnapshot(next); setError(""); }
        }
      } catch (e) { if (!controller.signal.aborted) setError(message(e)); }
      finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(() => void refresh(false), 15_000); }
      }
    }
    timer = setTimeout(() => void refresh(true), 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cursor, version]);
  const selected = snapshot?.items.find((g) => g.gpu_id === selectedId) ?? snapshot?.items[0];
  const metrics = selected?.metrics;
  function navigate(next?: string) { setSnapshot(null); setCursor(next); }
  return <div className="gpu-health-page monitor-page">
    <header className="gpu-health-hero"><div className="gpu-health-heading"><span className="eyebrow-badge">Registered infrastructure</span><h1>GPU health</h1><p>Live collector readings across Image, Video, TTS and Music services.</p></div>
      <div className="gpu-health-actions"><Link href="/gpus" className="button button--secondary">Manage GPUs</Link><button className="button button--secondary" type="button" disabled={loading} onClick={() => setVersion((v) => v + 1)}><RefreshIcon size={15} />{loading ? "Refreshing…" : "Refresh"}</button></div></header>
    {error && <p className="compute-notice compute-notice--error" role="alert">{snapshot ? "Refresh failed. Showing the last available readings. " : "Unable to load GPU monitoring. "}{error}</p>}
    {loading && !snapshot ? <p className="empty-state" role="status">Loading registered GPU collectors…</p> : snapshot && <>
      <section className="gpu-metric-grid" aria-label="Registry overview"><Metric label="Registered GPUs" value={String(snapshot.total)} detail="Includes disabled and draining GPUs" /><Metric label="Fresh healthy telemetry" value={error ? "—" : String(snapshot.items.filter((g) => g.health === "healthy").length)} detail="On this page" /><Metric label="Needs attention" value={error ? "—" : String(snapshot.items.filter((g) => g.health !== "healthy").length)} detail="On this page" /><Metric label="Reserved GPUs" value={String(snapshot.items.filter((g) => g.reservation_state).length)} detail="On this page · shared across products" /></section>
      {!snapshot.total ? <div className="gpu-empty-state"><GpuIcon /><h2>No GPUs registered</h2><p>Add a GPU with its collector to start monitoring.</p><Link className="button button--primary" href="/gpus/new">Add GPU</Link></div> : <>
        <section className="gpu-panel"><div className="compute-section-heading"><h2>GPU inventory</h2><span>Last successful refresh: {time(snapshot.observed_at)}</span></div>
          <div className="compute-table-wrap"><table className="compute-table monitor-table"><thead><tr><th>GPU</th><th>Collector</th><th>Products</th><th>Configuration</th><th>Reservation</th><th>CPU</th><th>RAM</th></tr></thead><tbody>{snapshot.items.map((g) => <tr key={g.gpu_id} aria-selected={selected?.gpu_id === g.gpu_id}>
            <td><button className="monitor-select" type="button" onClick={() => setSelectedId(g.gpu_id)} aria-pressed={selected?.gpu_id === g.gpu_id}>{g.name}</button><small>{g.gpu_model || g.server_id}</small></td><td><span className={`monitor-state monitor-state--${error ? "stale" : g.health}`}>{error ? "Last reading" : LABELS[g.health]}</span></td><td>{g.services.map((s) => PRODUCT_NAMES[s.service_type] ?? s.service_type).join(", ") || "No services"}</td><td>{g.desired_state}</td><td>{g.reservation_state || "Unreserved"}</td><td>{measurement(g.metrics?.cpu_percent, "%")}</td><td>{measurement(g.metrics?.memory.used_percent, "%")}</td>
          </tr>)}</tbody></table></div>
          {(back.length > 0 || snapshot.next_after_id) && <div className="compute-pagination"><button type="button" className="button button--secondary" disabled={!back.length || loading} onClick={() => { navigate(back.at(-1)); setBack((v) => v.slice(0, -1)); }}>Previous</button><span>Page {back.length + 1}</span><button type="button" className="button button--secondary" disabled={!snapshot.next_after_id || loading} onClick={() => { setBack((v) => [...v, cursor]); navigate(snapshot.next_after_id!); }}>Next</button></div>}
        </section>
        {selected && <section aria-label={`${selected.name} resources`} className="monitor-detail">
          <div className="compute-section-heading"><div><h2>{selected.name}</h2><p>Collector {selected.server_id} · Sampled {time(selected.sampled_at)}</p></div><Link href={`/gpus/${selected.gpu_id}`} className="button button--secondary">GPU configuration</Link></div>
          {selected.health !== "healthy" && <p className="compute-notice">{selected.health === "identity_mismatch" ? "Collector server ID or hardware UUID does not match this GPU. Verify the registration before trusting its measurements." : selected.health === "unavailable" ? "The collector could not be read. Check its address, credentials and availability." : selected.health === "stale" ? "These are old readings. The collector is not providing fresh samples." : "Some resource measurements are unavailable. Missing values are shown as —."}</p>}
          {!selected.hardware_uuid && <p className="compute-footer-note">Hardware identity is not configured. Device readings below cover all GPUs reported by this server’s collector.</p>}
          {metrics && <><div className="gpu-metric-grid"><Metric label="CPU utilization" value={measurement(metrics.cpu_percent, "%")} /><Metric label="RAM usage" value={measurement(metrics.memory.used_percent, "%")} detail={`${bytes(metrics.memory.used_bytes)} / ${bytes(metrics.memory.total_bytes)}`} /><Metric label="Network receive" value={bytes(metrics.network.bytes_received_per_second) + "/s"} /><Metric label="Network send" value={bytes(metrics.network.bytes_sent_per_second) + "/s"} /></div>
            <div className="monitor-device-grid">{metrics.devices.map((d) => <article className="gpu-panel" key={d.hardware_uuid}><h3>{d.name}</h3><p className="monitor-uuid">{d.hardware_uuid}</p><dl className="gpu-detail-list"><div><dt>GPU utilization</dt><dd>{measurement(d.utilization_percent, "%")}</dd></div><div><dt>VRAM</dt><dd>{measurement(d.memory_used_mib, " MiB")} / {measurement(d.memory_total_mib, " MiB")}</dd></div><div><dt>Temperature</dt><dd>{measurement(d.temperature_celsius, " °C")}</dd></div><div><dt>Power</dt><dd>{measurement(d.power_watts, " W")}</dd></div></dl></article>)}</div>
            {!metrics.devices.length && <p className="compute-notice">GPU device telemetry is unavailable. System resource measurements are shown where available.</p>}
            <div className="gpu-panel"><h3>System resources</h3><dl className="gpu-detail-list"><div><dt>Uptime</dt><dd>{measurement(metrics.uptime_seconds == null ? null : metrics.uptime_seconds / 3600, " hours")}</dd></div><div><dt>Swap</dt><dd>{bytes(metrics.swap.used_bytes)} / {bytes(metrics.swap.total_bytes)}</dd></div>{metrics.disks.map((disk) => <div key={disk.path}><dt>Disk {disk.path}</dt><dd>{measurement(disk.used_percent, "%")} · {bytes(disk.used_bytes)} / {bytes(disk.total_bytes)}</dd></div>)}</dl></div>
          </>}
          <div className="compute-tags">{selected.services.map((s) => <span key={s.service_id}>{PRODUCT_NAMES[s.service_type] ?? s.service_type} · {s.desired_state}</span>)}</div>
          <History key={`${selected.gpu_id}:${selected.revision}`} gpu={selected} />
        </section>}
      </>}
      <p className="gpu-refresh-note">Live readings refresh every 15 seconds while this tab is visible. Collector health describes resource telemetry; model readiness is checked separately when scheduling jobs.</p>
    </>}
  </div>;
}
