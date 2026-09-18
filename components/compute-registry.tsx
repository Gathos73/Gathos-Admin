"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { ApiError, createComputeCredential, createComputeGpu, drainComputeGpu, getComputeGpu, listComputeGpus, updateComputeGpu } from "@/lib/api";
import {
  computeError, CredentialSession, gpuDraft, matchesGpuWrite, newService, prepareGpuWrite, SERVICE_TYPES, validateGpuDraft,
  type ComputeState, type CredentialDraft, type GpuDraft, type GpuList, type GpuWrite, type RegisteredGpu, type ServiceDraft, type ServiceType,
} from "@/lib/compute-registry";
import { ConfirmDialog } from "./confirm-dialog";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, DeleteIcon, GpuIcon, PlusIcon, RefreshIcon } from "./icons";
import { ToastViewport, useToast } from "./toast";

function StateBadge({ state }: { state: ComputeState }) {
  const tone = state === "enabled" ? "active" : state === "draining" ? "pending" : "inactive";
  return <span className={`status-badge status-badge--${tone}`}>{state.charAt(0).toUpperCase() + state.slice(1)}</span>;
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <label className="form-field"><span className="form-label">{label}</span>{children}{help && <span className="form-help">{help}</span>}</label>;
}

export function ComputeRegistry() {
  const [page, setPage] = useState<GpuList | null>(null);
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setPage(null); setError("");
      void listComputeGpus(cursor, controller.signal).then((next) => {
        if (!controller.signal.aborted) { setPage(next); setError(""); }
      }).catch((failure) => {
        if (!controller.signal.aborted) setError(computeError(failure));
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cursor, refreshIndex]);

  return <div className="compute-page">
    <header className="record-page-header">
      <div><p className="section-kicker">Compute infrastructure</p><h1>GPUs &amp; Services</h1><p>Register GPU servers and the ML services that share their capacity.</p></div>
      <div className="record-page-actions">
        <button type="button" className="button button--secondary" disabled={loading} onClick={() => setRefreshIndex((value) => value + 1)}><RefreshIcon size={16} />Refresh</button>
        <Link className="button button--primary" href="/gpus/new"><PlusIcon size={16} />Add GPU</Link>
      </div>
    </header>
    {error && <div className="compute-notice compute-notice--error" role="alert"><AlertIcon size={18} />{error}</div>}
    <div className="compute-notice"><GpuIcon size={18} /><span>Each GPU has a collector and one or more services. Services on the same GPU share one execution slot. Enabled services become eligible once their health checks pass.</span></div>
    <section className="compute-inventory" aria-busy={loading} aria-label="Registered GPUs">
      <div className="compute-section-heading"><h2>GPU inventory</h2><span>{page ? `${page.items.length} on this page` : "Loading…"}</span></div>
      {loading ? <div className="empty-state" role="status">Loading GPU inventory…</div> : page?.items.length ? <div className="compute-table-wrap">
        <table className="compute-table"><thead><tr><th scope="col">GPU server</th><th scope="col">Services</th><th scope="col">Configuration</th><th scope="col">Reservation</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{page.items.map((gpu) => <tr key={gpu.gpu_id}>
            <td><Link className="compute-name" href={`/gpus/${gpu.gpu_id}`}>{gpu.name}</Link><small>{gpu.gpu_model || gpu.host_ref || "GPU server"}{gpu.vram_mib ? ` · ${(gpu.vram_mib / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB` : ""}</small></td>
            <td><div className="compute-tags">{gpu.services.map((service) => <span key={service.service_id} title={`${service.model_id} · ${service.desired_state}`}>{SERVICE_TYPES[service.service_type]?.label ?? service.service_type}</span>)}</div></td>
            <td><StateBadge state={gpu.desired_state} /></td>
            <td>{gpu.reservation ? <span className="compute-occupied">Reserved · {gpu.reservation.state}</span> : <span className="compute-muted">No active reservation</span>}</td>
            <td><Link className="button button--secondary" href={`/gpus/${gpu.gpu_id}`} aria-label={`Manage ${gpu.name}`}>Manage<ChevronRightIcon size={14} /></Link></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty-state"><GpuIcon /><strong>{error ? "Inventory unavailable" : "No GPUs registered"}</strong><span>{error ? "Refresh to try again." : "Add a GPU with its collector and first ML service to get started."}</span>{!error && <Link className="button button--primary" href="/gpus/new"><PlusIcon size={16} />Add your first GPU</Link>}</div>}
      {(history.length > 0 || page?.next_cursor) && <div className="compute-pagination">
        <button className="button button--secondary" disabled={loading || !history.length} type="button" onClick={() => { setCursor(history.at(-1)); setHistory((items) => items.slice(0, -1)); }}><ChevronLeftIcon size={16} />Previous</button>
        <span>Page {history.length + 1}</span>
        <button className="button button--secondary" disabled={loading || !page?.next_cursor} type="button" onClick={() => { setHistory((items) => [...items, cursor]); setCursor(page?.next_cursor ?? undefined); }}>Next<ChevronRightIcon size={16} /></button>
      </div>}
    </section>
    <p className="compute-footer-note">Configuration and reservations are shown here. <Link href="/gpu-health">View GPU health <ChevronRightIcon size={13} /></Link></p>
  </div>;
}

function CredentialFields({ value, onChange, required = false }: { value: CredentialDraft; onChange: (next: CredentialDraft) => void; required?: boolean }) {
  return <div className="compute-credentials">
    <Field label="Authentication">
      <select value={value.mode} onChange={(event) => onChange({ mode: event.target.value as CredentialDraft["mode"], reference: value.reference, label: value.label, apiKey: "", authorization: "" })}>
        {!required && <option value="none">No authentication</option>}
        <option value="new">Enter credentials</option><option value="existing">Use saved credential</option>
      </select>
    </Field>
    {value.mode === "existing" && <Field label="Saved credential" help="Existing secrets are never displayed. Choose ‘Enter credentials’ to replace them.">
      {value.label ? <>
        <input readOnly value={value.label} />
        <button type="button" className="button button--secondary" onClick={() => onChange({ ...value, reference: "", label: undefined })}>Use another saved credential</button>
      </> : <input required value={value.reference} maxLength={36} placeholder="Credential UUID" onChange={(event) => onChange({ ...value, reference: event.target.value })} />}
    </Field>}
    {value.mode === "new" && <div className="form-grid">
      <Field label="API key" help="Sent as X-API-Key."><input type="password" autoComplete="new-password" maxLength={4096} value={value.apiKey} onChange={(event) => onChange({ ...value, apiKey: event.target.value })} /></Field>
      <Field label="Authorization header" help="Optional alternative or additional header, including Bearer if required."><input type="password" autoComplete="new-password" maxLength={4096} value={value.authorization} onChange={(event) => onChange({ ...value, authorization: event.target.value })} /></Field>
    </div>}
  </div>;
}

function StateSelect({ value, onChange }: { value: ComputeState; onChange: (next: ComputeState) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as ComputeState)}>
    <option value="enabled">Enabled</option><option value="draining">Draining — stop new jobs</option><option value="disabled">Disabled</option>
    {value === "retired" && <option value="retired">Retired</option>}
  </select>;
}

function ServiceFields({ service, index, onChange, onRemove, onDrain, canDrain }: {
  service: ServiceDraft; index: number; onChange: (next: ServiceDraft) => void; onRemove?: () => void; onDrain?: () => void; canDrain: boolean;
}) {
  const change = <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) => onChange({ ...service, [key]: value });
  return <article className="compute-service" id={`service-${service.draftId}`}>
    <div className="compute-service-heading"><div><span className="compute-service-number">{index + 1}</span><h3>{SERVICE_TYPES[service.service_type].label}</h3>{service.service_id && <StateBadge state={service.desired_state} />}</div>
      {onRemove ? <button className="button button--secondary" type="button" aria-label={`Remove service ${index + 1}`} onClick={onRemove}><DeleteIcon size={14} />Remove</button> : onDrain && <button className="button button--secondary" type="button" disabled={!canDrain || service.desired_state !== "enabled"} onClick={onDrain} title={!canDrain ? "Save or reload your changes before draining." : undefined}>Drain service</button>}
    </div>
    <fieldset disabled={service.desired_state === "retired"}>
      <div className="form-grid">
        <Field label="Product type"><select value={service.service_type} disabled={Boolean(service.service_id)} onChange={(event) => {
          const type = event.target.value as ServiceType;
          onChange({ ...service, service_type: type, adapter: SERVICE_TYPES[type].adapter, pool_key: SERVICE_TYPES[type].pool });
        }}>{Object.entries(SERVICE_TYPES).map(([type, config]) => <option key={type} value={type}>{config.label}</option>)}</select></Field>
        <Field label="Service URL"><input type="url" required maxLength={2048} value={service.base_url} placeholder="https://gpu.example.com/image" onChange={(event) => change("base_url", event.target.value)} /></Field>
        <Field label="Model ID"><input required maxLength={160} value={service.model_id} placeholder="e.g. z-image-turbo" onChange={(event) => change("model_id", event.target.value)} /></Field>
        <Field label="Model revision" help="Use the same revision for interchangeable services in a pool."><input required maxLength={160} value={service.model_revision} placeholder="Checkpoint version or revision" onChange={(event) => change("model_revision", event.target.value)} /></Field>
        <Field label="Execution pool" help="Must match the product pool configured on the proxy."><input required maxLength={100} value={service.pool_key} onChange={(event) => change("pool_key", event.target.value)} /></Field>
        <Field label="Status"><StateSelect value={service.desired_state} onChange={(value) => change("desired_state", value)} /></Field>
      </div>
      <CredentialFields value={service.credential} onChange={(value) => change("credential", value)} />
      <details className="compute-advanced"><summary>Health check settings</summary><Field label="Health check path"><input required maxLength={255} value={service.health_path} onChange={(event) => change("health_path", event.target.value)} /></Field></details>
    </fieldset>
  </article>;
}

type PendingSave = { body: GpuWrite; key: string };

function GpuForm({ record, onSaved, onReload }: { record?: RegisteredGpu; onSaved: (gpu: RegisteredGpu) => void; onReload: () => void }) {
  const [draft, setDraft] = useState(() => gpuDraft(record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [drainTarget, setDrainTarget] = useState<{ serviceId?: string; label: string } | null>(null);
  const requestInFlight = useRef(false);
  const nextService = useRef(1);
  const credentials = useRef(new CredentialSession());
  const pending = useRef<PendingSave | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(gpuDraft(record));
  const retired = record?.desired_state === "retired";
  const disabled = busy || uncertain || Boolean(retired) || conflict;
  const change = <K extends keyof GpuDraft>(field: K, value: GpuDraft[K]) => setDraft((current) => ({ ...current, [field]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (requestInFlight.current || retired || conflict) return;
    const invalid = !pending.current && validateGpuDraft(draft);
    if (invalid) { setError(invalid); return; }
    requestInFlight.current = true; setBusy(true); setError("");
    try {
      if (!pending.current) {
        const body = await prepareGpuWrite(draft, (value, label) => credentials.current.resolve(value, label, createComputeCredential));
        pending.current = { body, key: crypto.randomUUID() };
      }
      const attempt = pending.current;
      let result: RegisteredGpu;
      if (record) {
        try { result = await updateComputeGpu(record.gpu_id, attempt.body, record.etag); }
        catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 412) throw failure;
          // A lost successful reply returns 412 on retry. Confirm it by reading.
          const current = await getComputeGpu(record.gpu_id);
          if (!matchesGpuWrite(current, attempt.body)) throw failure;
          result = current;
        }
      } else result = await createComputeGpu(attempt.body, attempt.key);
      pending.current = null; setUncertain(false); onSaved(result);
    } catch (failure) {
      const ambiguous = Boolean(pending.current) && (!(failure instanceof ApiError) || failure.status === 0 || failure.status >= 500);
      setUncertain(ambiguous);
      if (!ambiguous) pending.current = null;
      if (failure instanceof ApiError && failure.status === 412) setConflict(true);
      setError(computeError(failure));
    } finally { requestInFlight.current = false; setBusy(false); }
  }

  async function drain() {
    if (!record || !drainTarget || requestInFlight.current) return;
    requestInFlight.current = true; setBusy(true); setError("");
    try {
      const result = await drainComputeGpu(record.gpu_id, record.etag, drainTarget.serviceId);
      setDrainTarget(null); onSaved(result);
    } catch (failure) {
      setDrainTarget(null); setError(computeError(failure));
      if (failure instanceof ApiError && failure.status === 412) setConflict(true);
    } finally { requestInFlight.current = false; setBusy(false); }
  }

  return <>
    {record?.reservation && <div className="compute-notice"><GpuIcon size={18} /><span>This GPU has a <strong>{record.reservation.state}</strong> reservation. Existing jobs keep their assigned service version. Collector settings can change once the reservation is released.</span></div>}
    {retired && <div className="compute-notice">This GPU is retired. Its configuration is kept for reference.</div>}
    <form className="record-form compute-form" onSubmit={(event) => void save(event)}>
      {error && <div className="compute-notice compute-notice--error" role="alert"><AlertIcon size={18} /><span>{error}</span></div>}
      {uncertain && <div className="compute-notice" role="status">The save response could not be confirmed. Retry this same request to check the result before making further changes.</div>}
      {conflict && <button className="button button--secondary" type="button" onClick={onReload}>Reload saved record and discard these edits</button>}
      <fieldset disabled={disabled}>
        <section className="compute-form-section">
          <div className="compute-section-heading"><div><p className="section-kicker">Server</p><h2>GPU details</h2></div>{record && <StateBadge state={record.desired_state} />}</div>
          <div className="form-grid">
            <Field label="GPU name"><input required maxLength={160} value={draft.name} placeholder="GPU server 01" onChange={(event) => change("name", event.target.value)} /></Field>
            <Field label="Provider / host reference" help="Optional provider instance ID or server label."><input maxLength={255} value={draft.host_ref ?? ""} onChange={(event) => change("host_ref", event.target.value)} /></Field>
            <Field label="Hardware UUID (optional)" help="If available, enter the GPU UUID reported by the collector. Leave blank if your provider does not expose it; the collector server ID is still required."><input disabled={Boolean(record)} maxLength={255} value={draft.hardware_uuid ?? ""} placeholder="GPU-… or leave blank" onChange={(event) => change("hardware_uuid", event.target.value)} /></Field>
            <Field label="GPU model"><input maxLength={160} value={draft.gpu_model ?? ""} placeholder="e.g. NVIDIA RTX 4090" onChange={(event) => change("gpu_model", event.target.value)} /></Field>
            <Field label="VRAM (MiB)"><input type="number" min={1} step={1} value={draft.vram} placeholder="24576" onChange={(event) => change("vram", event.target.value)} /></Field>
            <Field label="Status"><StateSelect value={draft.desired_state} onChange={(value) => change("desired_state", value)} /></Field>
          </div>
        </section>
        <section className="compute-form-section">
          <div className="compute-section-heading"><div><p className="section-kicker">Monitoring</p><h2>Collector</h2></div><span>Required for every GPU</span></div>
          <fieldset disabled={Boolean(record?.reservation)}>
            <div className="form-grid">
              <Field label="Collector URL"><input type="url" required maxLength={2048} value={draft.collector.base_url} placeholder="https://gpu.example.com/collector" onChange={(event) => change("collector", { ...draft.collector, base_url: event.target.value })} /></Field>
              <Field label="Collector server ID" help="Must match COLLECTOR_SERVER_ID on the GPU server."><input required maxLength={255} value={draft.collector.server_id} placeholder="gpu-server-01" onChange={(event) => change("collector", { ...draft.collector, server_id: event.target.value })} /></Field>
            </div>
            <CredentialFields required value={draft.collector.credential} onChange={(value) => change("collector", { ...draft.collector, credential: value })} />
          </fieldset>
        </section>
        <section className="compute-form-section">
          <div className="compute-section-heading"><div><p className="section-kicker">Products</p><h2>ML services <span className="compute-count">{draft.services.length}</span></h2></div>
            <button className="button button--secondary" type="button" disabled={draft.services.length >= 100} onClick={() => {
              const id = `new-${nextService.current++}`;
              change("services", [...draft.services, newService(id)]);
              requestAnimationFrame(() => { const card = document.getElementById(`service-${id}`); card?.scrollIntoView({ block: "nearest", behavior: "smooth" }); card?.querySelector("select")?.focus(); });
            }}><PlusIcon size={16} />Add service</button>
          </div>
          <p className="compute-section-description">Add each model endpoint running on this GPU. Services share one execution slot across product types.</p>
          <div className="compute-service-list">{draft.services.map((service, index) => <ServiceFields key={service.draftId} service={service} index={index}
            onChange={(next) => change("services", draft.services.map((current) => current.draftId === service.draftId ? next : current))}
            onRemove={!service.service_id && draft.services.length > 1 ? () => change("services", draft.services.filter((current) => current.draftId !== service.draftId)) : undefined}
            onDrain={service.service_id ? () => setDrainTarget({ serviceId: service.service_id, label: `${SERVICE_TYPES[service.service_type].label} service` }) : undefined}
            canDrain={!dirty && !disabled} />)}</div>
        </section>
      </fieldset>
      <div className="compute-save-bar">
        <span>{record ? `Revision ${record.revision} · ${record.services.length} saved services` : "Register the server and its services together."}</span>
        <div>
          {record && record.desired_state === "enabled" && <button className="button button--secondary" type="button" disabled={disabled || dirty} onClick={() => setDrainTarget({ label: record.name })}>Drain GPU</button>}
          {!retired && <button className="button button--primary" type="submit" disabled={busy || conflict || (Boolean(record) && !dirty && !uncertain)}>{busy ? "Saving…" : uncertain ? "Retry save" : record ? "Save changes" : "Register GPU"}</button>}
        </div>
      </div>
    </form>
    <ConfirmDialog open={Boolean(drainTarget)} title={`Drain ${drainTarget?.label ?? "GPU"}?`} description="New jobs will stop using this resource. Its current job can finish, and you can enable it again later." confirmLabel="Drain" tone="default" busy={busy} onCancel={() => setDrainTarget(null)} onConfirm={() => void drain()} />
  </>;
}

export function ComputeGpuPage({ gpuId }: { gpuId?: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<RegisteredGpu>();
  const [loading, setLoading] = useState(Boolean(gpuId));
  const [error, setError] = useState("");
  const [reloadIndex, setReloadIndex] = useState(0);
  const { toasts, pushToast, dismissToast } = useToast();
  const currentRecord = record && (!gpuId || record.gpu_id === gpuId) ? record : undefined;
  const onReload = useCallback(() => setReloadIndex((value) => value + 1), []);
  useEffect(() => {
    if (!gpuId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setRecord(undefined); setError("");
      void getComputeGpu(gpuId, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setRecord(result); setError(""); }
      }).catch((failure) => { if (!controller.signal.aborted) setError(computeError(failure)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [gpuId, reloadIndex]);
  return <div className="compute-page">
    <Link className="compute-back" href="/gpus"><ChevronLeftIcon size={16} />GPUs &amp; Services</Link>
    <header className="record-page-header"><div><p className="section-kicker">Compute infrastructure</p><h1>{gpuId ? currentRecord?.name ?? "GPU configuration" : "Add GPU"}</h1><p>{gpuId ? "Manage this server’s collector and ML services." : "Connect a GPU server, its collector and the model services it runs."}</p></div></header>
    {error && <div className="compute-notice compute-notice--error" role="alert">{error}<button className="button button--secondary" type="button" onClick={onReload}>Reload</button></div>}
    {loading ? <div className="empty-state" role="status">Loading GPU configuration…</div> : (!gpuId || currentRecord) && <GpuForm key={`${currentRecord?.etag ?? "new"}:${reloadIndex}`} record={currentRecord} onReload={onReload} onSaved={(saved) => {
      setRecord(saved); pushToast("GPU configuration saved. The proxy will pick up the changes automatically.", "success");
      if (!gpuId) router.replace(`/gpus/${saved.gpu_id}`);
    }} />}
    <ToastViewport toasts={toasts} onDismiss={dismissToast} />
  </div>;
}
