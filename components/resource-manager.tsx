"use client";

import { clearRequestCache } from "@/lib/request-cache";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ApiError,
  createResource,
  deleteResource,
  getResourceRecord,
  listResource,
} from "../lib/api";
import {
  cacheProducts,
  EMPTY_CATALOG_INLINE_DRAFTS,
  newProductLimitDraft,
  PRODUCT_CACHE,
  serializePlanLimitDrafts,
  serializeProductRouteDrafts,
  type CatalogInlineDrafts,
} from "../lib/catalog-inline-drafts";

import { getResourceConfig } from "../lib/resources";
import type { JsonObject, ResourceKey, ResourceListResponse, ResourceRecord } from "../lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { DataTable } from "./data-table";
import {
  AlertIcon,
  CloseIcon,
  DeleteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "./icons";
import { recordLabel } from "./record-detail";
import { RecordForm } from "./record-form";
import { PlanLimitsCreateInline } from "./plan-limits-inline";
import { ProductRoutesCreateInline } from "./product-routes-inline";
import { ToastViewport, useToast } from "./toast";
import { useDialogFocus } from "./use-dialog-focus";

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" };

interface DeleteRequest {
  ids: string[];
  description: string;
}

interface ResourceLoadState {
  error: string | null;
  requestKey: string;
  rows: ResourceRecord[];
  total: number;
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function firstSecret(payload: JsonObject, fields: string[]): string | null {
  for (const field of fields) {
    if (typeof payload[field] === "string") return payload[field] as string;
  }
  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = value as JsonObject;
    for (const field of fields) {
      if (typeof nested[field] === "string") return nested[field] as string;
    }
  }
  return null;
}

interface SecretDialogProps {
  secret: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

function SecretDialog({ secret, copied, onCopy, onClose }: SecretDialogProps) {
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({
    initialFocusRef: copyButtonRef,
    onEscape: onClose,
    open: Boolean(secret),
  });

  if (!secret) return null;
  return (
    <div className="modal-backdrop">
      <section
        aria-labelledby="api-key-secret-title"
        aria-modal="true"
        className="secret-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="secret-icon" aria-hidden="true">
          <AlertIcon size={20} />
        </div>
        <h2 id="api-key-secret-title">Copy this API key now</h2>
        <p>The full key is shown once and cannot be recovered after this dialog is closed.</p>
        <code className="secret-value">{secret}</code>
        <div className="dialog-actions">
          <button className="button button--secondary" onClick={onCopy} ref={copyButtonRef} type="button">
            {copied ? "Copied" : "Copy key"}
          </button>
          <button className="button button--primary" onClick={onClose} type="button">
            I have saved it
          </button>
        </div>
      </section>
    </div>
  );
}

export function ResourceManager({ resourceKey, initialData }: { resourceKey: ResourceKey; initialData?: ResourceListResponse | null }) {
  const config = getResourceConfig(resourceKey);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const customPlanUserId = resourceKey === "plans" ? searchParams.get("create_for_user") : null;
  const { toasts, pushToast, dismissToast } = useToast();

  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(200, positiveInteger(searchParams.get("page_size"), 50));
  const sortableColumnNames = useMemo(
    () => new Set(config.listDisplay.filter((column) => column.sortable).map((column) => column.name)),
    [config.listDisplay],
  );
  const requestedOrder = searchParams.get("order_by");
  const orderBy =
    requestedOrder && sortableColumnNames.has(requestedOrder)
      ? requestedOrder
      : config.defaultOrder;
  const descending = searchParams.has("descending")
    ? searchParams.get("descending") !== "false"
    : config.defaultDescending;
  const search = searchParams.get("q")?.trim() ?? "";
  const requestedSearchField = searchParams.get("search_field");
  const searchField =
    requestedSearchField && config.searchFields.some((field) => field.value === requestedSearchField)
      ? requestedSearchField
      : config.searchFields[0]?.value ?? "";
  const requestedFilter = searchParams.get("filter_by");
  const filterBy =
    requestedFilter && config.filters.some((filter) => filter.name === requestedFilter)
      ? requestedFilter
      : "";
  const filterValue = searchParams.get("filter_value") ?? "";
  const hasFilterValue = searchParams.has("filter_value");

  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestKey = JSON.stringify({
    descending,
    filterBy,
    filterValue,
    hasFilterValue,
    orderBy,
    page,
    pageSize,
    refreshVersion,
    resourceKey,
    search,
    searchField,
  });
  const [loadState, setLoadState] = useState<ResourceLoadState>(initialData ? {
    error: null,
    requestKey,
    rows: initialData.rows,
    total: initialData.pagination.total,
  } : {
    error: null,
    requestKey: "",
    rows: [],
    total: 0,
  });
  const loading = loadState.requestKey !== requestKey;
  const rows = loading ? [] : loadState.rows;
  const total = loading ? 0 : loadState.total;
  const loadError = loading ? null : loadState.error;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchDraftOverride, setSearchDraft] = useState<string | null>(null);
  const [filterDraftOverride, setFilterDraft] = useState<string | null>(null);
  const searchDraft = searchDraftOverride ?? search;
  const filterDraft = filterDraftOverride ?? filterValue;
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [customPlanUser, setCustomPlanUser] = useState<ResourceRecord | null>(null);
  const [createDefaults, setCreateDefaults] = useState<ResourceRecord | undefined>(undefined);
  const [inlineDrafts, setInlineDrafts] = useState<CatalogInlineDrafts>(
    EMPTY_CATALOG_INLINE_DRAFTS,
  );
  const [inlineError, setInlineError] = useState("");
  const [planProducts, setPlanProducts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [productCatalog, setProductCatalog] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    if (!customPlanUserId) return;
    const controller = new AbortController();
    void getResourceRecord("users", customPlanUserId, controller.signal)
      .then(({ row }) => {
        if (controller.signal.aborted) return;
        if (!row || row.status === "deleted" || row.deleted_at) {
          throw new Error("This user is no longer available.");
        }
        setCustomPlanUser(row);
        setCreateDefaults({
          code: `custom_${String(row.id).replaceAll("-", "")}_${Date.now().toString(36)}`,
          display_name: `Custom plan for ${String(row.name || row.email)}`,
          is_public: false,
        });
        setInlineDrafts({ planLimits: [], productRoutes: [] });
        setPlanProducts([]);
        setInlineError("");
        setDrawer({ mode: "create" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) pushToast(getErrorMessage(error), "error");
      });
    return () => controller.abort();
  }, [customPlanUserId, pushToast]);

  useEffect(() => {
    if (resourceKey !== "plans" || drawer.mode === "closed" || productCatalog.length) return;
    let active = true;
    listResource("products", { page: 1, pageSize: 200, orderBy: "code", descending: false })
      .then((res) => {
        if (!active) return;
        cacheProducts(res.rows);
        const catalog = res.rows.map((r) => ({
          id: String(r.id),
          code: String(r.code ?? ""),
          name: String(r.name ?? r.display_name ?? r.code ?? ""),
        }));
        setProductCatalog(catalog);
        setPlanProducts((prev) =>
          prev.map((p) => {
            const found = catalog.find((c) => c.id === p.id);
            return found ? { ...p, code: found.code, name: found.name } : p;
          }),
        );
        setInlineDrafts((current) => ({
          ...current,
          planLimits: current.planLimits.map((d) => {
            const found = catalog.find((c) => c.id === d.productId);
            return found
              ? { ...d, productCode: found.code || d.productCode, productName: found.name || d.productName }
              : d;
          }),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [drawer.mode, productCatalog.length, resourceKey]);

  const [submitting, setSubmitting] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<JsonObject | null>(null);

  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const drawerOpen = drawer.mode !== "closed";
  const dialogOpen = Boolean(deleteRequest) || Boolean(secret) || Boolean(pendingPlan);
  const planConfirmRef = useDialogFocus<HTMLElement>({
    open: Boolean(pendingPlan), onEscape: submitting ? undefined : () => setPendingPlan(null),
  });
  const drawerDialogRef = useDialogFocus<HTMLElement>({
    onEscape: submitting ? undefined : () => closeCreate(),
    open: drawerOpen && !dialogOpen,
  });

  const replaceParameters = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (loadState.requestKey === requestKey) return;
    const controller = new AbortController();
    let active = true;
    listResource(
      resourceKey,
      {
        page,
        pageSize,
        orderBy,
        descending,
        search: search || undefined,
        searchField: search ? searchField : undefined,
        filterBy: filterBy && hasFilterValue ? filterBy : undefined,
        filterValue: filterBy && hasFilterValue ? filterValue : undefined,
      },
      controller.signal,
    )
      .then((response) => {
        if (!active) return;
        setLoadState({
          error: null,
          requestKey,
          rows: response.rows,
          total: response.pagination.total,
        });
        setSelectedIds([]);
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setLoadState({
          error: getErrorMessage(error),
          requestKey,
          rows: [],
          total: 0,
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [descending, filterBy, filterValue, hasFilterValue, loadState.requestKey, orderBy, page, pageSize, requestKey, resourceKey, search, searchField]);

  const refresh = () => { clearRequestCache(); setRefreshVersion((version) => version + 1); };

  const openCreate = () => {
    setCustomPlanUser(null);
    setCreateDefaults(undefined);
    if (customPlanUserId) replaceParameters({ create_for_user: null });
    setInlineDrafts({ planLimits: [], productRoutes: [] });
    setInlineError("");
    setPlanProducts([]);
    setDrawer({ mode: "create" });
  };

  const closeCreate = () => {
    setDrawer({ mode: "closed" });
    setCustomPlanUser(null);
    setCreateDefaults(undefined);
    if (customPlanUserId) replaceParameters({ create_for_user: null });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    replaceParameters({
      q: searchDraft.trim() || null,
      search_field: searchDraft.trim() ? searchField : null,
      page: null,
    });
    setSearchDraft(null);
  };

  const activeFilter = config.filters.find((filter) => filter.name === filterBy);
  const applyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    replaceParameters({ filter_value: filterBy ? filterDraft.trim() || null : null, page: null });
    setFilterDraft(null);
  };

  const sort = (column: string) => {
    replaceParameters({
      order_by: column,
      descending: orderBy === column ? String(!descending) : "true",
      page: null,
    });
  };

  const openRecord = (record: ResourceRecord, mode: "view" | "edit") => {
    const id = String(record[config.primaryKey] ?? "");
    if (!id) return;
    const recordPath = `${pathname}/${encodeURIComponent(id)}`;
    router.push(mode === "edit" ? `${recordPath}/edit` : recordPath);
  };

  const submitRecord = async (payload: JsonObject) => {
    if (drawer.mode !== "create") return;
    const createPayload: JsonObject = { ...payload };
    if (resourceKey === "plans") {
      const productIds = Array.isArray(payload.product_ids)
        ? payload.product_ids.map(String)
        : planProducts.map((p) => p.id);
      const result = serializePlanLimitDrafts(inlineDrafts.planLimits, productIds);
      if (result.error) {
        setInlineError(result.error);
        pushToast(result.error, "error");
        return;
      }
      createPayload.plan_limits = result.rows ?? [];
    } else if (resourceKey === "products") {
      const result = serializeProductRouteDrafts(inlineDrafts.productRoutes);
      if (result.error) {
        setInlineError(result.error);
        pushToast(result.error, "error");
        return;
      }
      createPayload.product_routes = result.rows ?? [];
    }

    setInlineError("");
    if (resourceKey === "plans" && Number(createPayload.price_minor) > 0 && !createPayload.provider_price_id) {
      setPendingPlan(createPayload);
      return;
    }
    await saveNewRecord(createPayload);
  };

  const saveNewRecord = async (createPayload: JsonObject) => {
    setInlineError("");
    setSubmitting(true);
    try {
      const response = await createResource(config, createPayload);
      const createdSecret = firstSecret(response, config.secretResponseFields ?? []);
      if (createdSecret) {
        setSecret(createdSecret);
        setSecretCopied(false);
      }
      pushToast(`${config.labelSingular} created.`, "success");
      setPendingPlan(null);
      const createdPlan = response.row;
      if (resourceKey === "plans" && customPlanUser && createdPlan && typeof createdPlan === "object" && !Array.isArray(createdPlan) && createdPlan.id) {
        clearRequestCache();
        setDrawer({ mode: "closed" });
        router.push(`/plans/${encodeURIComponent(String(createdPlan.id))}?invite_user=${encodeURIComponent(String(customPlanUser.id))}`);
        return;
      }
      closeCreate();
      refresh();
    } catch (error) {
      const message = getErrorMessage(error);
      if (resourceKey === "plans" || resourceKey === "products") setInlineError(message);
      pushToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const requestRowDelete = (record: ResourceRecord) => {
    const id = String(record[config.primaryKey] ?? "");
    setDeleteRequest({
      ids: [id],
      description: `Delete ${config.labelSingular} “${recordLabel(record, config.primaryKey)}”? This cannot be undone.`,
    });
  };

  const confirmDelete = async () => {
    if (!deleteRequest) return;
    setDeleting(true);
    const results = await Promise.allSettled(
      deleteRequest.ids.map((id) => deleteResource(config, id)),
    );
    const failed = results.filter((result) => result.status === "rejected");
    const succeeded = results.length - failed.length;
    if (succeeded > 0) {
      pushToast(`${succeeded} ${succeeded === 1 ? config.labelSingular : config.label} deleted.`, "success");
    }
    if (failed.length > 0) {
      const firstFailure = failed[0] as PromiseRejectedResult;
      pushToast(
        `${failed.length} deletion${failed.length === 1 ? "" : "s"} failed: ${getErrorMessage(firstFailure.reason)}`,
        "error",
      );
    }
    setSelectedIds((current) => current.filter((id) => !deleteRequest.ids.includes(id)));
    setDeleteRequest(null);
    setDeleting(false);
    if (succeeded > 0) refresh();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  return (
    <div className="resource-manager">
      <div
        className="resource-manager-content"
        inert={drawerOpen || dialogOpen ? true : undefined}
      >
      <header className="resource-header">
        <div>
          <p className="resource-eyebrow">Database administration</p>
          <h1>{config.label}</h1>
          <p>{config.description}</p>
        </div>
        <div className="resource-header-actions">
          <button className="button button--secondary" disabled={loading} onClick={refresh} type="button">
            <RefreshIcon className={loading ? "spin" : undefined} size={16} />
            Refresh
          </button>
          {config.canCreate ? (
            <button className="button button--primary" onClick={openCreate} type="button">
              <PlusIcon size={16} />
              Add {config.labelSingular}
            </button>
          ) : null}
        </div>
      </header>

      <section className="resource-panel">
        <div className="resource-toolbar">
          <form className="search-form" onSubmit={submitSearch}>
            <span aria-hidden="true" className="search-prefix">
              <SearchIcon size={16} />
            </span>
            <input
              aria-label={`Search ${config.label}`}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={`Search ${config.label.toLowerCase()}…`}
              type="search"
              value={searchDraft}
            />
            {config.searchFields.length > 1 ? (
              <select
                aria-label="Search field"
                onChange={(event) => replaceParameters({ search_field: event.target.value, page: null })}
                value={searchField}
              >
                {config.searchFields.map((field) => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button className="button button--secondary" type="submit">
              Search
            </button>
          </form>

          {config.filters.length > 0 ? (
            <form className="filter-form" onSubmit={applyFilter}>
              <select
                aria-label="Filter field"
                onChange={(event) => {
                  setFilterDraft("");
                  replaceParameters({ filter_by: event.target.value || null, filter_value: null, page: null });
                }}
                value={filterBy}
              >
                <option value="">Filter by…</option>
                {config.filters.map((filter) => (
                  <option key={filter.name} value={filter.name}>
                    {filter.label}
                  </option>
                ))}
              </select>
              {activeFilter?.options ? (
                <select
                  aria-label="Filter value"
                  disabled={!filterBy}
                  onChange={(event) => setFilterDraft(event.target.value)}
                  value={filterDraft}
                >
                  <option value="">Choose…</option>
                  {activeFilter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Filter value"
                  disabled={!filterBy}
                  onChange={(event) => setFilterDraft(event.target.value)}
                  placeholder="Exact value"
                  value={filterDraft}
                />
              )}
              <button className="button button--secondary" disabled={!filterBy} type="submit">
                Apply
              </button>
            </form>
          ) : null}

          {search || filterBy ? (
            <button
              className="button button--ghost"
              onClick={() =>
                replaceParameters({ q: null, search_field: null, filter_by: null, filter_value: null, page: null })
              }
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>

        {config.canBulkDelete && selectedIds.length > 0 ? (
          <div className="selection-toolbar">
            <strong>{selectedIds.length} selected</strong>
            <button
              className="button button--danger button--small"
              onClick={() =>
                setDeleteRequest({
                  ids: selectedIds,
                  description: `Delete ${selectedIds.length} selected records? This cannot be undone.`,
                })
              }
              type="button"
            >
              <DeleteIcon size={15} />
              Delete selected
            </button>
          </div>
        ) : null}

        {loadError ? (
          <div className="error-banner" role="alert">
            <AlertIcon size={17} />
            <span>{loadError}</span>
            <button className="button button--small button--secondary" onClick={refresh} type="button">
              Retry
            </button>
          </div>
        ) : null}

        <DataTable
          canDelete={config.canDelete}
          canEdit={config.canEdit}
          columns={config.listDisplay}
          descending={descending}
          loading={loading}
          onDelete={requestRowDelete}
          onEdit={(record) => openRecord(record, "edit")}
          onSelectionChange={setSelectedIds}
          onSort={sort}
          onView={(record) => openRecord(record, "view")}
          orderBy={orderBy}
          primaryKey={config.primaryKey}
          rows={rows}
          selectedIds={selectedIds}
          selectionEnabled={config.canBulkDelete}
        />

        <footer className="table-footer">
          <span>
            {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {total.toLocaleString()}
          </span>
          <label className="page-size-control">
            Rows per page
            <select
              onChange={(event) => replaceParameters({ page_size: event.target.value, page: null })}
              value={pageSize}
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label={`${config.label} pagination`} className="pagination-controls">
            <button
              className="button button--small button--secondary"
              disabled={page <= 1 || loading}
              onClick={() => replaceParameters({ page: String(page - 1) })}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              className="button button--small button--secondary"
              disabled={page >= totalPages || loading}
              onClick={() => replaceParameters({ page: String(page + 1) })}
              type="button"
            >
              Next
            </button>
          </nav>
        </footer>
      </section>
      </div>

      {drawer.mode !== "closed" ? (
        <div
          className="drawer-backdrop"
          inert={dialogOpen ? true : undefined}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) closeCreate();
          }}
        >
          <aside
            aria-labelledby="record-drawer-title"
            aria-modal="true"
            className={`record-drawer${resourceKey === "plans" || resourceKey === "products" ? " record-drawer--with-inlines" : ""}`}
            ref={drawerDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="drawer-header">
              <div>
                <p className="resource-eyebrow">{config.label}</p>
                <h2 id="record-drawer-title">{customPlanUser ? "Create custom plan" : `Add ${config.labelSingular}`}</h2>
              </div>
              <button
                aria-label="Close drawer"
                className="icon-button"
                disabled={submitting}
                onClick={closeCreate}
                type="button"
              >
                <CloseIcon size={19} />
              </button>
            </div>
            <div className="drawer-body">
              {customPlanUser ? (
                <p>For {String(customPlanUser.email)}. The plan starts private. Creating it does not change the user’s current plan; invite them after configuring payment or assign it from their profile.</p>
              ) : null}
              <RecordForm
                config={config}
                initialRecord={createDefaults}
                key={`create-${resourceKey}-${customPlanUser?.id ?? "general"}`}
                mode="create"
                onCancel={closeCreate}
                onFieldValueChange={(name, value) => {
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
                  // Build product metadata from loaded product catalog and cache
                  const freshProducts = productIds.map((id) => {
                    const row = PRODUCT_CACHE.get(id) || productCatalog.find((r) => r.id === id);
                    return { id, code: row ? row.code : "", name: row ? row.name : "" };
                  });


                  setPlanProducts(freshProducts);
                  setInlineDrafts((current) => {
                    const currentDraftIds = new Set(current.planLimits.map((d) => d.productId));
                    // Remove drafts for deselected products
                    const kept = current.planLimits.filter((d) => productIdSet.has(d.productId));
                    // Add a blank draft for each newly-selected product
                    const newDrafts = freshProducts
                      .filter((p) => !currentDraftIds.has(p.id))
                      .map((p) => newProductLimitDraft(crypto.randomUUID(), p.id, p.code, p.name));
                    return { ...current, planLimits: [...kept, ...newDrafts] };
                  });
                }}
                onSubmit={submitRecord}
                submitting={submitting}
              >
                {resourceKey === "plans" ? (
                  <PlanLimitsCreateInline
                    allowedProducts={planProducts}
                    drafts={inlineDrafts.planLimits}
                    error={inlineError}
                    onChange={(planLimits) => {
                      setInlineError("");
                      setInlineDrafts((current) => ({ ...current, planLimits }));
                    }}
                    submitting={submitting}
                  />
                ) : null}
                {resourceKey === "products" ? (
                  <ProductRoutesCreateInline
                    drafts={inlineDrafts.productRoutes}
                    error={inlineError}
                    onChange={(productRoutes) => {
                      setInlineError("");
                      setInlineDrafts((current) => ({ ...current, productRoutes }));
                    }}
                    submitting={submitting}
                  />
                ) : null}
              </RecordForm>
            </div>
          </aside>
        </div>
      ) : null}

      {pendingPlan ? (
        <div className="modal-backdrop">
          <section ref={planConfirmRef} tabIndex={-1} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="create-dodo-title">
            <div className="dialog-header"><h2 id="create-dodo-title">Create a matching Dodo product?</h2></div>
            <p className="dialog-description">Create “{String(pendingPlan.display_name)}” in Dodo with {String(pendingPlan.price_minor)} minor units in {String(pendingPlan.currency)}, billed {pendingPlan.billing_interval === "none" ? "once" : `every ${String(pendingPlan.billing_interval)}`}? Checkout becomes available after syncing succeeds. Later edits will not create or update a Dodo product.</p>
            {inlineError ? <p className="form-error" role="alert">{inlineError}</p> : null}
            <div className="dialog-actions">
              <button type="button" className="button button--secondary" disabled={submitting} onClick={() => setPendingPlan(null)}>Back</button>
              <button type="button" className="button button--secondary" disabled={submitting} onClick={() => void saveNewRecord({ ...pendingPlan, create_dodo_product: false })}>Create locally only</button>
              <button type="button" className="button button--primary" disabled={submitting} onClick={() => void saveNewRecord({ ...pendingPlan, create_dodo_product: true })}>{submitting ? "Creating…" : "Create plan and Dodo product"}</button>
            </div>
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        busy={deleting}
        confirmLabel={deleteRequest && deleteRequest.ids.length > 1 ? "Delete records" : "Delete record"}
        description={deleteRequest?.description ?? ""}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
        open={Boolean(deleteRequest)}
        title={deleteRequest && deleteRequest.ids.length > 1 ? "Delete selected records?" : "Delete this record?"}
      />
      <SecretDialog
        copied={secretCopied}
        onClose={() => {
          setSecret(null);
          setSecretCopied(false);
        }}
        onCopy={async () => {
          if (!secret) return;
          try {
            await navigator.clipboard.writeText(secret);
            setSecretCopied(true);
            pushToast("API key copied.", "success");
          } catch {
            pushToast("Copy failed. Select the key and copy it manually.", "error");
          }
        }}
        secret={secret}
      />
      <ToastViewport onDismiss={dismissToast} toasts={toasts} />
    </div>
  );
}
