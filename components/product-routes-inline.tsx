"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { ApiError, createResource, deleteResource, updateResource } from "@/lib/api";
import {
  newProductRouteDraft,
  serializeProductRouteDrafts,
  type ProductRouteDraft,
} from "@/lib/catalog-inline-drafts";
import { getResourceConfig } from "@/lib/resources";
import type { JsonObject, ResourceRecord } from "@/lib/types";
import { PlusIcon } from "./icons";

type InlineMode = "view" | "edit";
const PRODUCT_ROUTE_CONFIG = getResourceConfig("product_routes");

function optionalText(value: unknown): string {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function draftFrom(record?: ResourceRecord): ProductRouteDraft {
  return {
    ...newProductRouteDraft(String(record?.id ?? "persisted-route")),
    routeCode: String(record?.route_code ?? ""),
    providerCode: String(record?.provider_code ?? ""),
    providerProductCode: String(record?.provider_product_code ?? ""),
    executionPool: String(record?.execution_pool ?? ""),
    priority: record?.priority == null ? "100" : String(record.priority),
    credentialSecretName: String(record?.credential_secret_name ?? ""),
    executorConfig: JSON.stringify(record?.executor_config ?? {}, null, 2),
  };
}

function requestError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status > 0 ? `${error.message} (HTTP ${error.status})` : error.message;
  }
  return error instanceof Error ? error.message : "The product route could not be saved.";
}

function RouteFields({
  disabled = false,
  draft,
  onChange,
  showDelete = false,
}: {
  disabled?: boolean;
  draft: ProductRouteDraft;
  onChange: (draft: ProductRouteDraft) => void;
  showDelete?: boolean;
}) {
  const change = (changes: Partial<ProductRouteDraft>) => onChange({ ...draft, ...changes });
  return (
    <div className="product-route-inline-grid">
      <label>
        <span>Route code</span>
        <input aria-label="Route code" disabled={disabled} onChange={(event) => change({ routeCode: event.target.value })} required value={draft.routeCode} />
      </label>
      <label>
        <span>Provider</span>
        <input aria-label="Provider code" disabled={disabled} onChange={(event) => change({ providerCode: event.target.value })} required value={draft.providerCode} />
      </label>
      <label>
        <span>Provider product</span>
        <input aria-label="Provider product code" disabled={disabled} onChange={(event) => change({ providerProductCode: event.target.value })} value={draft.providerProductCode} />
      </label>
      <label>
        <span>Execution pool</span>
        <input aria-label="Execution pool" disabled={disabled} maxLength={100} onChange={(event) => change({ executionPool: event.target.value })} value={draft.executionPool} />
      </label>
      <label>
        <span>Priority</span>
        <input aria-label="Route priority" disabled={disabled} min={0} max={32767} onChange={(event) => change({ priority: event.target.value })} required step={1} type="number" value={draft.priority} />
      </label>
      <label>
        <span>Credential reference</span>
        <input aria-label="Credential reference" disabled={disabled} onChange={(event) => change({ credentialSecretName: event.target.value })} value={draft.credentialSecretName} />
      </label>
      <label className="product-route-config-field">
        <span>Executor configuration</span>
        <textarea aria-label="Executor configuration" disabled={disabled} onChange={(event) => change({ executorConfig: event.target.value })} rows={4} value={draft.executorConfig} />
      </label>
      {showDelete ? (
        <label className="plan-limit-delete-field">
          <span>Delete?</span>
          <input aria-label={`Delete ${draft.routeCode}`} checked={draft.deleteRequested} disabled={disabled} onChange={(event) => change({ deleteRequested: event.target.checked })} type="checkbox" />
        </label>
      ) : null}
    </div>
  );
}

function InlineRouteForm({
  onCancel,
  onChanged,
  productId,
  route,
}: {
  onCancel?: () => void;
  onChanged: (message: string) => void;
  productId: string;
  route?: ResourceRecord;
}) {
  const [draft, setDraft] = useState<ProductRouteDraft>(() => draftFrom(route));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const id = route?.id ? String(route.id) : null;
  const protectedRoute = Boolean(route?.in_use || route?.retired_at);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (draft.deleteRequested && id) {
      setSubmitting(true);
      try {
        await deleteResource(PRODUCT_ROUTE_CONFIG, id);
        onChanged(`Product route “${draft.routeCode}” deleted.`);
      } catch (cause) {
        setError(requestError(cause));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const serialized = serializeProductRouteDrafts([draft]);
    if (serialized.error || !serialized.rows?.[0]) {
      setError(serialized.error ?? "The route is incomplete.");
      return;
    }
    const payload: JsonObject = { ...serialized.rows[0], product_id: productId };
    setSubmitting(true);
    try {
      if (id) await updateResource(PRODUCT_ROUTE_CONFIG, id, payload);
      else await createResource(PRODUCT_ROUTE_CONFIG, payload);
      onChanged(`Product route “${draft.routeCode.trim()}” ${id ? "updated" : "created"}.`);
      if (!id) onCancel?.();
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="product-route-inline-form" onSubmit={save}>
      <fieldset disabled={submitting || protectedRoute}>
        <RouteFields disabled={protectedRoute} draft={draft} onChange={setDraft} showDelete={Boolean(id)} />
      </fieldset>
      {protectedRoute ? <p className="inline-protected-note">Used or retired routes cannot be changed. Add a new route instead.</p> : null}
      {error ? <p className="plan-limit-inline-error" role="alert">{error}</p> : null}
      {!protectedRoute ? (
        <div className="plan-limit-inline-actions">
          {onCancel ? <button className="button button--secondary button--small" disabled={submitting} onClick={onCancel} type="button">Cancel</button> : null}
          <button className={`button button--small${draft.deleteRequested ? " button--danger" : " button--primary"}`} disabled={submitting} type="submit">
            {submitting ? "Saving…" : draft.deleteRequested ? "Delete route" : id ? "Save route" : "Add route"}
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function ProductRoutesCreateInline({ drafts, error, onChange, submitting }: {
  drafts: ProductRouteDraft[];
  error: string;
  onChange: (drafts: ProductRouteDraft[]) => void;
  submitting: boolean;
}) {
  const update = (index: number, draft: ProductRouteDraft) => onChange(drafts.map((current, currentIndex) => currentIndex === index ? draft : current));
  return (
    <section className="create-inline-section product-routes-create-inline" aria-labelledby="create-product-routes-title">
      <fieldset className="create-inline-fieldset" disabled={submitting}>
        <header className="create-inline-header">
          <div>
            <h3 id="create-product-routes-title">Product routes <span className="inline-count">{drafts.length}</span></h3>
            <p>Create provider routes together with the product.</p>
          </div>
          <button className="button button--secondary button--small" onClick={() => onChange([...drafts, newProductRouteDraft(crypto.randomUUID())])} type="button">
            <PlusIcon size={14} /> Add route
          </button>
        </header>
        {drafts.length ? (
          <div className="plan-limit-inline-list">
            {drafts.map((draft, index) => (
              <article className="plan-limit-inline-row plan-limit-inline-row--new" key={draft.draftKey}>
                <div className="plan-limit-inline-row-title">
                  <strong>{draft.routeCode.trim() || `New product route ${index + 1}`}</strong>
                  <button className="button button--ghost button--small" onClick={() => onChange(drafts.filter((_, currentIndex) => currentIndex !== index))} type="button">Remove</button>
                </div>
                <RouteFields draft={draft} onChange={(next) => update(index, next)} />
              </article>
            ))}
          </div>
        ) : <div className="plan-limits-empty"><strong>No product routes yet</strong><span>You can create the product without routes or add one here.</span></div>}
      </fieldset>
      {error ? <p className="plan-limit-inline-error" role="alert">{error}</p> : null}
    </section>
  );
}

export function ProductRoutesInline({ routes, mode, onChanged, productId }: {
  routes: ResourceRecord[];
  mode: InlineMode;
  onChanged: (message: string) => void;
  productId: string;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="product-routes-inline record-page-panel">
      <header className="record-page-panel-header">
        <div>
          <h2>Product routes <span className="inline-count">{routes.length}</span></h2>
          <p>{mode === "edit" ? "Edit each available provider route in place. Inline changes save independently from the product form." : "Provider routes configured for this product."}</p>
        </div>
        {mode === "edit" && !adding ? <button className="button button--secondary button--small" onClick={() => setAdding(true)} type="button"><PlusIcon size={14} /> Add route</button> : null}
      </header>
      {mode === "view" ? (
        routes.length ? (
          <div className="plan-limits-table-scroll">
            <table className="plan-limits-table product-routes-table">
              <thead><tr><th>Route</th><th>Provider</th><th>Provider product</th><th>Pool</th><th>Priority</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{routes.map((route) => {
                const id = String(route.id);
                const status = route.retired_at ? "Retired" : route.in_use ? "In use" : "Available";
                return <tr key={id}><td><code>{String(route.route_code)}</code></td><td>{String(route.provider_code)}</td><td>{optionalText(route.provider_product_code)}</td><td>{optionalText(route.execution_pool)}</td><td>{Number(route.priority).toLocaleString()}</td><td><span className="status-pill">{status}</span></td><td><Link href={`/product-routes/${encodeURIComponent(id)}/edit`}>Change</Link></td></tr>;
              })}</tbody>
            </table>
          </div>
        ) : <div className="plan-limits-empty"><strong>No product routes</strong><span>This product has no configured provider routes.</span></div>
      ) : (
        <div className="plan-limit-inline-list">
          {routes.map((route) => (
            <article className="plan-limit-inline-row" key={String(route.id)}>
              <div className="plan-limit-inline-row-title"><strong>{String(route.route_code)}</strong><Link href={`/product-routes/${encodeURIComponent(String(route.id))}`}>View record</Link></div>
              <InlineRouteForm onChanged={onChanged} productId={productId} route={route} />
            </article>
          ))}
          {adding ? <article className="plan-limit-inline-row plan-limit-inline-row--new"><div className="plan-limit-inline-row-title"><strong>New product route</strong></div><InlineRouteForm onCancel={() => setAdding(false)} onChanged={onChanged} productId={productId} /></article> : null}
          {!routes.length && !adding ? <div className="plan-limits-empty"><strong>No product routes</strong><span>Add the first provider route for this product.</span></div> : null}
        </div>
      )}
    </section>
  );
}
