"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import {
  ApiError,
  deleteResource,
  updateResource,
} from "@/lib/api";
import {
  getProductName,
  type ProductLimitDraft,
  useProductCache,
} from "@/lib/catalog-inline-drafts";

import { getResourceConfig } from "@/lib/resources";
import type { JsonObject, JsonValue, ResourceRecord } from "@/lib/types";

type InlineMode = "view" | "edit";

const PLAN_LIMIT_CONFIG = getResourceConfig("plan_limits");

function displayValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  return Number(value).toLocaleString();
}

function draftFrom(record: ResourceRecord): ProductLimitDraft {
  return {
    draftKey: String(record.id),
    productId: String(record.product_id ?? ""),
    productCode: String(record.product_code ?? ""),
    productName: String(record.product_name ?? ""),
    fixedWindowLimit: record.fixed_window_limit == null ? "" : String(record.fixed_window_limit),
    queueDepthLimit: record.queue_depth_limit == null ? "" : String(record.queue_depth_limit),
    concurrencyLimit: record.concurrency_limit == null ? "" : String(record.concurrency_limit),
    deleteRequested: false,
  };
}

function requestError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status > 0 ? `${error.message} (HTTP ${error.status})` : error.message;
  }
  return error instanceof Error ? error.message : "The plan limit could not be saved.";
}

/** Limit inputs for one product-scoped draft (used in both create and edit flows). */
function ProductLimitFields({
  draft,
  onChange,
  showDelete = false,
}: {
  draft: ProductLimitDraft;
  onChange: (draft: ProductLimitDraft) => void;
  showDelete?: boolean;
}) {
  const change = (changes: Partial<ProductLimitDraft>) => onChange({ ...draft, ...changes });

  const productName = getProductName(draft.productId, draft.productName, draft.productCode);
  const productDisplay = productName || "Product";

  return (
    <div className="plan-limit-inline-grid">
      <label>
        <span>Product</span>
        <input
          aria-label="Product"
          disabled
          readOnly
          type="text"
          value={productDisplay}
        />
      </label>
      <label>
        <span>Fixed-window limit <span className="form-field-requirement">(Optional)</span></span>
        <input
          aria-label="Fixed window limit"
          min={0}
          onChange={(e) => change({ fixedWindowLimit: e.target.value })}
          placeholder="e.g. 100 (blank: unlimited)"
          step={1}
          type="number"
          value={draft.fixedWindowLimit}
        />
      </label>
      <label>
        <span>Queue depth limit <span className="form-field-requirement">(Optional)</span></span>
        <input
          aria-label="Queue depth limit"
          min={0}
          onChange={(e) => change({ queueDepthLimit: e.target.value })}
          placeholder="e.g. 10 (blank: unlimited)"
          step={1}
          type="number"
          value={draft.queueDepthLimit}
        />
      </label>
      <label>
        <span>Concurrency limit <span className="form-field-requirement">(Optional)</span></span>
        <input
          aria-label="Concurrency limit"
          min={1}
          onChange={(e) => change({ concurrencyLimit: e.target.value })}
          placeholder="e.g. 3 (blank: unlimited)"
          step={1}
          type="number"
          value={draft.concurrencyLimit}
        />
      </label>
      {showDelete ? (
        <label className="plan-limit-delete-field">
          <span>Delete?</span>
          <input
            aria-label={`Delete limit for ${draft.productName || draft.productCode}`}
            checked={draft.deleteRequested}
            onChange={(e) => change({ deleteRequested: e.target.checked })}
            type="checkbox"
          />
        </label>
      ) : null}
    </div>
  );
}

function InlineLimitForm({
  limit,
  planId,
  onCancel,
  onChanged,
}: {
  limit: ResourceRecord;
  planId: string;
  onCancel?: () => void;
  onChanged: (message: string) => void;
}) {
  const [draft, setDraft] = useState<ProductLimitDraft>(() => draftFrom(limit));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const id = String(limit.id);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (draft.deleteRequested) {
      setSubmitting(true);
      try {
        await deleteResource(PLAN_LIMIT_CONFIG, id);
        onChanged(`Product limit for "${draft.productName || draft.productCode}" deleted.`);
      } catch (cause) {
        setError(requestError(cause));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const payload: JsonObject = {
      plan_id: planId,
      product_id: draft.productId,
      fixed_window_limit: draft.fixedWindowLimit.trim() === "" ? null : Number(draft.fixedWindowLimit),
      queue_depth_limit: draft.queueDepthLimit.trim() === "" ? null : Number(draft.queueDepthLimit),
      concurrency_limit: draft.concurrencyLimit.trim() === "" ? null : Number(draft.concurrencyLimit),
    };

    setSubmitting(true);
    try {
      await updateResource(PLAN_LIMIT_CONFIG, id, payload);
      onChanged(`Product limit for "${draft.productName || draft.productCode}" updated.`);
      onCancel?.();
    } catch (cause) {
      setError(requestError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="plan-limit-inline-form" onSubmit={save}>
      <fieldset disabled={submitting}>
        <ProductLimitFields draft={draft} onChange={setDraft} showDelete />
      </fieldset>
      {error ? <p className="plan-limit-inline-error" role="alert">{error}</p> : null}
      <div className="plan-limit-inline-actions">
        {onCancel ? (
          <button className="button button--secondary button--small" disabled={submitting} onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
        <button
          className={`button button--small${draft.deleteRequested ? " button--danger" : " button--primary"}`}
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Saving…" : draft.deleteRequested ? "Delete limit" : "Save limit"}
        </button>
      </div>
    </form>
  );
}

/** Used inside the Create Plan drawer — shows per-product limit inputs for each selected product. */
export function PlanLimitsCreateInline({
  allowedProducts,
  drafts,
  error,
  onChange,
  submitting,
}: {
  allowedProducts: { id: string; code: string; name: string }[];
  drafts: ProductLimitDraft[];
  error: string;
  onChange: (drafts: ProductLimitDraft[]) => void;
  submitting: boolean;
}) {
  const productCache = useProductCache();
  const update = (index: number, draft: ProductLimitDraft) =>
    onChange(drafts.map((current, i) => (i === index ? draft : current)));

  if (allowedProducts.length === 0) return null;

  return (
    <section className="create-inline-section plan-limits-create-inline" aria-labelledby="create-plan-limits-title">
      <fieldset className="create-inline-fieldset" disabled={submitting}>
        <header className="create-inline-header">
          <div>
            <h3 id="create-plan-limits-title">
              Product limits <span className="inline-count">{drafts.length}</span>
            </h3>
            <p>Set per-product limits for each selected product. Leave fields blank for unlimited.</p>
          </div>
        </header>
        <div className="plan-limit-inline-list">
          {drafts.map((draft, index) => {
            const product = allowedProducts.find((p) => p.id === draft.productId)
              ?? productCache.get(draft.productId);
            const productName = getProductName(
              draft.productId,
              draft.productName,
              product?.name,
            ) || product?.name || "Product";
            const productCode = (draft.productCode && draft.productCode !== draft.productId)
              ? draft.productCode
              : product?.code || "";
            const resolvedDraft: ProductLimitDraft = {
              ...draft,
              productName,
              productCode,
            };
            return (
              <article className="plan-limit-inline-row plan-limit-inline-row--new" key={draft.draftKey}>
                <div className="plan-limit-inline-row-title">
                  <strong>{productName}</strong>
                  {productCode ? (
                    <span className="plan-limit-product-code">{productCode}</span>
                  ) : null}
                </div>
                <ProductLimitFields draft={resolvedDraft} onChange={(next) => update(index, next)} />
              </article>
            );
          })}
        </div>
      </fieldset>
      {error ? <p className="plan-limit-inline-error" role="alert">{error}</p> : null}
    </section>
  );
}

/** Used in the Plan record page — view/edit existing product limits. */
export function PlanLimitsInline({
  limits,
  mode,
  onChanged,
  planId,
}: {
  limits: ResourceRecord[];
  mode: InlineMode;
  onChanged: (message: string) => void;
  planId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const productCache = useProductCache();

  return (
    <section className="plan-limits-inline record-page-panel">
      <header className="record-page-panel-header">
        <div>
          <h2>Product limits <span className="inline-count">{limits.length}</span></h2>
          <p>
            {mode === "edit"
              ? "Edit each product limit below. Changes save independently from the plan form."
              : "Per-product generation limits attached to this plan."}
          </p>
        </div>
      </header>

      {limits.length > 0 ? (
        <div className="plan-limits-table-scroll">
          <table className="plan-limits-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Fixed window</th>
                <th>Queue depth</th>
                <th>Concurrency</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {limits.map((limit) => {
                const id = String(limit.id);
                const isEditing = mode === "edit" && editingId === id;
                const productId = String(limit.product_id ?? "");
                const product = productCache.get(productId);
                const productName = getProductName(
                  productId,
                  String(limit.product_name ?? ""),
                  product?.name,
                ) || product?.name || (limit.product_code && limit.product_code !== productId ? String(limit.product_code) : "") || product?.code || "Product";
                const productCode = (limit.product_code && limit.product_code !== productId ? String(limit.product_code) : "") || product?.code || "";
                return (
                  <tr key={id}>
                    {isEditing ? (
                      <td colSpan={5}>
                        <InlineLimitForm
                          limit={{
                            ...limit,
                            product_name: productName,
                            product_code: productCode,
                          }}
                          planId={planId}
                          onCancel={() => setEditingId(null)}
                          onChanged={(msg) => { setEditingId(null); onChanged(msg); }}
                        />
                      </td>
                    ) : (
                      <>
                        <td>
                          <strong>{productName}</strong>
                          {productCode ? <><br /><code>{productCode}</code></> : null}
                        </td>
                        <td>{displayValue(limit.fixed_window_limit)}</td>
                        <td>{displayValue(limit.queue_depth_limit)}</td>
                        <td>{displayValue(limit.concurrency_limit)}</td>
                        <td>
                          {mode === "edit" ? (
                            <button className="button button--ghost button--small" onClick={() => setEditingId(id)} type="button">Edit</button>
                          ) : (
                            <Link href={`/plan-limits/${encodeURIComponent(id)}`}>View</Link>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="plan-limits-empty">
          <strong>No product limits</strong>
          <span>This plan has no per-product limits. Add one to restrict usage by product.</span>
        </div>
      )}
    </section>
  );
}
