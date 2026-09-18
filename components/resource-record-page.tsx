"use client";

import Link from "next/link";
import { PlanBillingActions } from "./plan-billing-actions";
import { clearRequestCache } from "@/lib/request-cache";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ApiError,
  deleteResource,
  getResourceRecord,
  updateResource,
} from "../lib/api";
import {
  EMPTY_CATALOG_INLINE_DRAFTS,
  PRODUCT_CACHE,
  cacheProducts,
  newProductLimitDraft,
  serializePlanLimitDrafts,
  type CatalogInlineDrafts,
  type ProductLimitDraft,
} from "../lib/catalog-inline-drafts";
import { getResourceConfig } from "../lib/resources";
import type { JsonObject, ResourceKey, ResourceRecord } from "../lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import {
  AlertIcon,
  ChevronRightIcon,
  DeleteIcon,
  EditIcon,
  KeyIcon,
  PlusIcon,
  RefreshIcon,
} from "./icons";
import { recordLabel } from "../lib/record-label";
import { RecordForm } from "./record-form";
import { PlanLimitsCreateInline, PlanLimitsInline } from "./plan-limits-inline";
import { ProductRoutesInline } from "./product-routes-inline";
import { RecordUserInline } from "./record-user-inline";
import { ToastViewport, useToast } from "./toast";
import { UserPasswordDialog } from "./user-password-form";

type RecordPageMode = "view" | "edit";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface RecordLoadState {
  error: string | null;
  record: ResourceRecord | null;
  requestKey: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status > 0 ? `${error.message} (HTTP ${error.status})` : error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return DATE_FORMATTER.format(date);
}

function objectRows(value: unknown): ResourceRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ResourceRecord => Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function primaryRecordFields(resourceKey: ResourceKey, record: ResourceRecord): ResourceRecord {
  const fields = { ...record };
  if (resourceKey === "plans") {
    delete fields.plan_limits;
  } else if (resourceKey === "products") {
    delete fields.product_routes;
  } else if (resourceKey === "api_keys") {
    // Shown in the user section below the form.
    delete fields.user;
    delete fields.user_id;
    // The product is shown once as its name; ids and the compat list are noise.
    delete fields.product_id;
    delete fields.product_code;
    delete fields.product_codes;
  } else if (resourceKey === "users") {
    for (const field of [
      "window_limit",
      "max_concurrent",
      "image_window_limit",
      "tts_window_limit",
      "video_window_limit",
      "tier_override",
    ]) {
      delete fields[field];
    }
    // Derived from the plan's products/limits (e.g. image2image_window_limit).
    delete fields.product_codes;
    for (const key of Object.keys(fields)) {
      if (key.endsWith("_window_limit")) delete fields[key];
    }
  }
  return fields;
}

export function ResourceRecordPage({
  initialRecord,
  mode,
  recordId,
  resourceKey,
  resourceSlug,
}: {
  initialRecord?: ResourceRecord | null;
  mode: RecordPageMode;
  recordId: string;
  resourceKey: ResourceKey;
  resourceSlug: string;
}) {
  const config = getResourceConfig(resourceKey);
  const router = useRouter();
  const { dismissToast, pushToast, toasts } = useToast();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestKey = `${resourceKey}:${recordId}:${refreshVersion}`;
  const [loadState, setLoadState] = useState<RecordLoadState>({
    error: null,
    record: initialRecord ?? null,
    requestKey: initialRecord ? `${resourceKey}:${recordId}:0` : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [planProducts, setPlanProducts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [inlineDrafts, setInlineDrafts] = useState<CatalogInlineDrafts>(EMPTY_CATALOG_INLINE_DRAFTS);
  const [inlineError, setInlineError] = useState("");

  const loading = loadState.requestKey !== requestKey;
  const record = loading ? null : loadState.record;
  const loadError = loading ? null : loadState.error;
  const encodedId = encodeURIComponent(recordId);
  const listPath = `/${resourceSlug}`;
  const viewPath = `${listPath}/${encodedId}`;
  const editPath = `${viewPath}/edit`;
  const label = record ? recordLabel(record, config.primaryKey) : recordId;
  const canResetUserPassword =
    mode === "view" &&
    resourceKey === "users" &&
    Boolean(record && record.status !== "deleted" && !record.deleted_at);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const initialResponse =
      refreshVersion === 0 && initialRecord
        ? Promise.resolve({ table: resourceKey, row: initialRecord })
        : getResourceRecord(resourceKey, recordId, controller.signal);

    initialResponse
      .then((response) => {
        if (!active) return;
        const row = response.row;
        if (row) {
          if (Array.isArray(row.plan_products)) {
            cacheProducts(row.plan_products as Array<{ id?: unknown; code?: unknown; name?: unknown }>);
          }
          if (Array.isArray(row.plan_limits)) {
            cacheProducts(
              (row.plan_limits as Array<{ product_id?: unknown; product_name?: unknown; product_code?: unknown }>)
                .filter((l) => l.product_id)
                .map((l) => ({ id: l.product_id, name: l.product_name, code: l.product_code })),
            );
          }
          if (resourceKey === "plan_limits" && row.product_id) {
            cacheProducts([{ id: row.product_id, name: row.product_name, code: row.product_code }]);
          }
          if (resourceKey === "plans") {
            const rawLimits = objectRows(row.plan_limits);
            const rawProducts = Array.isArray(row.plan_products)
              ? (row.plan_products as Array<{ id: unknown; code?: unknown; name?: unknown }>)
              : [];
            const productList = rawProducts.map((p) => ({
              id: String(p.id),
              code: String(p.code ?? ""),
              name: String(p.name ?? ""),
            }));
            setPlanProducts(productList);

            const limitMap = new Map<string, ResourceRecord>();
            for (const lim of rawLimits) {
              if (lim.product_id) limitMap.set(String(lim.product_id), lim);
            }

            const drafts: ProductLimitDraft[] = productList.map((p) => {
              const existing = limitMap.get(p.id);
              if (existing) {
                return {
                  draftKey: String(existing.id || p.id),
                  productId: p.id,
                  productCode: p.code,
                  productName: p.name,
                  fixedWindowLimit: existing.fixed_window_limit == null ? "" : String(existing.fixed_window_limit),
                  queueDepthLimit: existing.queue_depth_limit == null ? "" : String(existing.queue_depth_limit),
                  concurrencyLimit: existing.concurrency_limit == null ? "" : String(existing.concurrency_limit),
                  deleteRequested: false,
                };
              }
              return newProductLimitDraft(crypto.randomUUID(), p.id, p.code, p.name);
            });

            setInlineDrafts((curr) => ({ ...curr, planLimits: drafts }));
          }
        }
        setLoadState({ error: null, record: row, requestKey });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoadState({ error: errorMessage(error), record: null, requestKey });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [initialRecord, recordId, refreshVersion, requestKey, resourceKey]);

  const handleFieldValueChange = (name: string, value: unknown) => {
    if (resourceKey !== "plans" || name !== "product_ids") return;
    setInlineError("");
    let productIds: string[] = [];
    try {
      const parsed = JSON.parse(String(value || "[]"));
      if (Array.isArray(parsed)) productIds = parsed.map(String);
    } catch {
      productIds = [];
    }
    const productIdSet = new Set(productIds);
    const freshProducts = productIds.map((id) => {
      const row = PRODUCT_CACHE.get(id) || planProducts.find((r) => r.id === id);
      return { id, code: row ? row.code : "", name: row ? row.name : "" };
    });

    setPlanProducts(freshProducts);
    setInlineDrafts((current) => {
      const currentDraftIds = new Set(current.planLimits.map((d) => d.productId));
      const kept = current.planLimits.filter((d) => productIdSet.has(d.productId));
      const newDrafts = freshProducts
        .filter((p) => !currentDraftIds.has(p.id))
        .map((p) => newProductLimitDraft(crypto.randomUUID(), p.id, p.code, p.name));
      return { ...current, planLimits: [...kept, ...newDrafts] };
    });
  };

  async function submitRecord(payload: JsonObject) {
    setSubmitting(true);
    setActionError(null);
    setSuccessMessage(null);
    const updatePayload: JsonObject = { ...payload };

    if (resourceKey === "plans") {
      const productIds = Array.isArray(payload.product_ids)
        ? payload.product_ids.map(String)
        : planProducts.map((p) => p.id);
      const result = serializePlanLimitDrafts(inlineDrafts.planLimits, productIds);
      if (result.error) {
        setInlineError(result.error);
        pushToast(result.error, "error");
        setSubmitting(false);
        return;
      }
      updatePayload.plan_limits = result.rows ?? [];
      updatePayload.product_ids = productIds;
    }

    try {
      const response = await updateResource(config, recordId, updatePayload);
      const saved = response.row;
      if (saved && typeof saved === "object" && !Array.isArray(saved) && saved.id && saved.id !== recordId) {
        router.push(`${listPath}/${encodeURIComponent(String(saved.id))}`);
        return;
      }
      const message = `${config.labelSingular[0].toUpperCase()}${config.labelSingular.slice(1)} updated successfully.`;
      setSuccessMessage(message);
      pushToast(message, "success");
      clearRequestCache(); setRefreshVersion((version) => version + 1);
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      if (resourceKey === "plans") setInlineError(message);
      pushToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteResource(config, recordId);
      setDeleteOpen(false);
      router.push(listPath);
      router.refresh();
    } catch (error) {
      const message = errorMessage(error);
      setActionError(message);
      pushToast(message, "error");
      setDeleteOpen(false);
      setDeleting(false);
    }
  }

  function handleInlineChanged(message: string) {
    setSuccessMessage(message);
    pushToast(message, "success");
    clearRequestCache();
    setRefreshVersion((version) => version + 1);
  }

  return (
    <div className="record-page">
      <nav aria-label="Record breadcrumb" className="record-page-breadcrumbs">
        <Link href={listPath}>{config.label}</Link>
        <ChevronRightIcon aria-hidden="true" size={13} />
        <span aria-current="page">{mode === "edit" ? `Edit ${label}` : label}</span>
      </nav>

      {resourceKey === "plans" && record && mode === "view" ? <PlanBillingActions plan={record} onChanged={handleInlineChanged} onRefresh={() => { clearRequestCache(); setRefreshVersion((version) => version + 1); }} /> : null}
      <header className="record-page-header">
        <div>
          <p className="resource-eyebrow">{mode === "edit" ? "Change record" : "Record detail"}</p>
          <h1>{mode === "edit" ? `Edit ${config.labelSingular}` : label}</h1>
          <p>
            {mode === "edit"
              ? `Update the configured ${config.labelSingular} fields. Database-managed fields remain read-only.`
              : `Review this ${config.labelSingular} and its database-managed metadata.`}
          </p>
        </div>
        <div className="record-page-actions">
          <Link className="button button--secondary" href={listPath}>
            Back to {config.label.toLowerCase()}
          </Link>
          {canResetUserPassword ? (
            <Link
              className="button button--secondary"
              href={`/plans?create_for_user=${encodedId}`}
            >
              <PlusIcon size={15} />
              Create custom plan
            </Link>
          ) : null}
          {canResetUserPassword ? (
            <button
              className="button button--secondary"
              onClick={() => setPasswordDialogOpen(true)}
              type="button"
            >
              <KeyIcon size={15} />
              Reset password
            </button>
          ) : null}
          {mode === "view" && config.canEdit ? (
            <Link className="button button--primary" href={editPath}>
              <EditIcon size={15} />
              Edit
            </Link>
          ) : null}
          {mode === "edit" ? (
            <Link className="button button--secondary" href={viewPath}>
              View record
            </Link>
          ) : null}
          {config.canDelete && record ? (
            <button className="button button--danger" onClick={() => setDeleteOpen(true)} type="button">
              <DeleteIcon size={15} />
              Delete
            </button>
          ) : null}
        </div>
      </header>

      {record ? (
        <section aria-label="Record metadata" className="record-summary">
          <div>
            <span>Record ID</span>
            <code>{recordId}</code>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatDate(record.created_at)}</strong>
          </div>
          <div>
            <span>Last updated</span>
            <strong>{formatDate(record.updated_at)}</strong>
          </div>
        </section>
      ) : null}

      <section className="record-page-panel">
        <header className="record-page-panel-header">
          <div>
            <h2>{mode === "edit" ? `${config.labelSingular} information` : "Database fields"}</h2>
            <p>
              {mode === "edit"
                ? "Fields shown here are controlled by this resource’s configurable fields list."
                : "Read-only values returned by the administration API."}
            </p>
          </div>
          {loading ? <span className="record-loading-label">Loading…</span> : null}
        </header>

        {actionError ? (
          <div className="record-message record-message--error" role="alert">
            <AlertIcon size={17} />
            <div>
              <strong>The request was not saved</strong>
              <span>{actionError}</span>
            </div>
          </div>
        ) : null}
        {successMessage ? (
          <div className="record-message record-message--success" role="status">
            <div>
              <strong>Saved</strong>
              <span>{successMessage}</span>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="record-load-error" role="alert">
            <span className="state-icon state-icon--error">
              <AlertIcon size={20} />
            </span>
            <h2>Could not load this record</h2>
            <p>{loadError}</p>
            <button
              className="button button--secondary"
              onClick={() => { clearRequestCache(); setRefreshVersion((version) => version + 1); }}
              type="button"
            >
              <RefreshIcon size={15} />
              Retry
            </button>
          </div>
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading record" className="record-page-skeleton">
            {Array.from({ length: 8 }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
        ) : record ? (
          <div className="record-page-panel-body">
            {mode === "edit" ? (
              <RecordForm
                config={config}
                initialRecord={record}
                key={`edit-${recordId}-${refreshVersion}`}
                mode="edit"
                onCancel={() => router.push(viewPath)}
                onFieldValueChange={handleFieldValueChange}
                onSubmit={submitRecord}
                submitting={submitting}
              >
                {resourceKey === "plans" ? (
                  <PlanLimitsCreateInline
                    allowedProducts={planProducts}
                    drafts={inlineDrafts.planLimits}
                    error={inlineError}
                    onChange={(planLimits) =>
                      setInlineDrafts((current) => ({ ...current, planLimits }))
                    }
                    submitting={submitting}
                  />
                ) : null}
              </RecordForm>
            ) : (
              <RecordForm
                config={config}
                initialRecord={primaryRecordFields(resourceKey, record)}
                key={`view-${recordId}-${refreshVersion}`}
                mode="edit"
                readOnly
              />
            )}
          </div>
        ) : null}
      </section>

      {resourceKey === "plans" && record && mode === "view" ? (
        <PlanLimitsInline
          limits={objectRows(record.plan_limits)}
          mode={mode}
          onChanged={handleInlineChanged}
          planId={recordId}
        />
      ) : null}

      {resourceKey === "products" && record ? (
        <ProductRoutesInline
          mode={mode}
          onChanged={handleInlineChanged}
          productId={recordId}
          routes={objectRows(record.product_routes)}
        />
      ) : null}

      {resourceKey === "api_keys" && record && mode === "view" ? (
        <RecordUserInline record={record} />
      ) : null}

      <ConfirmDialog
        busy={deleting}
        confirmLabel="Delete record"
        description={`Delete ${config.labelSingular} “${label}”? This cannot be undone.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        open={deleteOpen}
        title="Delete this record?"
      />
      {record ? (
        <UserPasswordDialog
          email={String(record.email ?? label)}
          onCancel={() => setPasswordDialogOpen(false)}
          onSuccess={() => {
            setPasswordDialogOpen(false);
            pushToast(`Password reset successfully for ${String(record.email ?? label)}.`, "success");
          }}
          open={passwordDialogOpen}
          userId={recordId}
        />
      ) : null}
      <ToastViewport onDismiss={dismissToast} toasts={toasts} />
    </div>
  );
}
