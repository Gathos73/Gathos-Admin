import { useEffect, useState } from "react";
import { listResource } from "./api";
import type { JsonObject } from "./types";

export interface ProductLimitDraft {
  draftKey: string;
  productId: string;
  productCode: string; // display only
  productName: string; // display only
  fixedWindowLimit: string;
  queueDepthLimit: string;
  concurrencyLimit: string;
  deleteRequested: boolean;
}

export interface ProductRouteDraft {
  draftKey: string;
  routeCode: string;
  providerCode: string;
  providerProductCode: string;
  executionPool: string;
  priority: string;
  credentialSecretName: string;
  executorConfig: string;
  deleteRequested: boolean;
}

export interface CatalogInlineDrafts {
  planLimits: ProductLimitDraft[];
  productRoutes: ProductRouteDraft[];
}

export const EMPTY_CATALOG_INLINE_DRAFTS: CatalogInlineDrafts = {
  planLimits: [],
  productRoutes: [],
};

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
}

export const PRODUCT_CACHE = new Map<string, ProductSummary>();

const listeners = new Set<() => void>();

export function subscribeProductCache(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function useProductCache(): Map<string, ProductSummary> {
  const [cache, setCache] = useState(() => PRODUCT_CACHE);
  useEffect(() => {
    return subscribeProductCache(() => {
      setCache(new Map(PRODUCT_CACHE));
    });
  }, []);
  return cache;
}

export function cacheProducts(
  products: { id?: unknown; code?: unknown; name?: unknown; display_name?: unknown }[],
): void {
  let changed = false;
  for (const p of products) {
    if (!p.id) continue;
    const id = String(p.id);
    const existing = PRODUCT_CACHE.get(id);
    const code = String(p.code ?? existing?.code ?? "");
    const rawName = String(p.name ?? p.display_name ?? existing?.name ?? p.code ?? "");
    const name = rawName !== id ? rawName : existing?.name ?? code;
    if (!existing || existing.code !== code || existing.name !== name) {
      PRODUCT_CACHE.set(id, { id, code, name });
      changed = true;
    }
  }
  if (changed) {
    for (const listener of listeners) {
      listener();
    }
  }
}

let ensurePromise: Promise<void> | null = null;

export async function ensureProductsCached(): Promise<void> {
  if (PRODUCT_CACHE.size > 0) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      const res = await listResource("products", { page: 1, pageSize: 200, orderBy: "code", descending: false });
      cacheProducts(res.rows);
    } catch {
      // ignore network errors
    } finally {
      ensurePromise = null;
    }
  })();
  return ensurePromise;
}

export function getProductName(productId: string, fallbackName?: string, fallbackCode?: string): string {
  if (fallbackName && fallbackName.trim() && fallbackName !== productId) {
    return fallbackName.trim();
  }
  const cached = PRODUCT_CACHE.get(productId);
  if (cached?.name && cached.name !== productId) {
    return cached.name;
  }
  if (fallbackCode && fallbackCode.trim() && fallbackCode !== productId) {
    return fallbackCode.trim();
  }
  if (cached?.code && cached.code !== productId) {
    return cached.code;
  }
  return "";
}

const ROUTE_CODE = /^[a-z][a-z0-9_-]{1,79}$/;

/** Create a product limit draft pre-populated with the product info. */
export function newProductLimitDraft(
  draftKey: string,
  productId: string,
  productCode = "",
  productName = "",
): ProductLimitDraft {
  const cached = PRODUCT_CACHE.get(productId);
  const resolvedCode = productCode && productCode !== productId ? productCode : cached?.code || "";
  const resolvedName = productName && productName !== productId
    ? productName
    : cached?.name || resolvedCode || "";
  return {
    draftKey,
    productId,
    productCode: resolvedCode,
    productName: resolvedName,
    fixedWindowLimit: "",
    queueDepthLimit: "",
    concurrencyLimit: "",
    deleteRequested: false,
  };
}


export function newProductRouteDraft(draftKey: string): ProductRouteDraft {
  return {
    draftKey,
    routeCode: "",
    providerCode: "",
    providerProductCode: "",
    executionPool: "",
    priority: "100",
    credentialSecretName: "",
    executorConfig: "{}",
    deleteRequested: false,
  };
}

function parseOptionalInt(value: string, fieldLabel: string, min = 0): { error?: string; value: number | null } {
  const trimmed = value.trim();
  if (trimmed === "") return { value: null };
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min) {
    return { error: `${fieldLabel} must be a whole number of ${min} or more.`, value: null };
  }
  return { value: parsed };
}

export function serializePlanLimitDrafts(
  drafts: ProductLimitDraft[],
  allowedProductIds: string[],
): { error?: string; rows?: JsonObject[] } {
  const allowed = new Set(allowedProductIds);
  const seenProducts = new Set<string>();
  const rows: JsonObject[] = [];

  for (const [index, draft] of drafts.entries()) {
    const productName = getProductName(draft.productId, draft.productName, draft.productCode);
    const label = `Product limit ${index + 1} (${productName || "Product"})`;

    if (!allowed.has(draft.productId)) {
      return { error: `${label}: product is not in the plan's product list.` };
    }
    if (seenProducts.has(draft.productId)) {
      return { error: `${label}: each product can only have one limit block.` };
    }
    seenProducts.add(draft.productId);

    const fixedWindowLimit = parseOptionalInt(draft.fixedWindowLimit, `${label} fixed window limit`);
    if (fixedWindowLimit.error) return { error: fixedWindowLimit.error };

    const queueDepthLimit = parseOptionalInt(draft.queueDepthLimit, `${label} queue depth limit`);
    if (queueDepthLimit.error) return { error: queueDepthLimit.error };

    const concurrencyLimit = parseOptionalInt(draft.concurrencyLimit, `${label} concurrency limit`, 1);
    if (concurrencyLimit.error) return { error: concurrencyLimit.error };

    rows.push({
      product_id: draft.productId,
      fixed_window_limit: fixedWindowLimit.value,
      queue_depth_limit: queueDepthLimit.value,
      concurrency_limit: concurrencyLimit.value,
    });
  }
  return { rows };
}


export function serializeProductRouteDrafts(
  drafts: ProductRouteDraft[],
): { error?: string; rows?: JsonObject[] } {
  const codes = new Set<string>();
  const rows: JsonObject[] = [];

  for (const [index, draft] of drafts.entries()) {
    const label = `Product route ${index + 1}`;
    const routeCode = draft.routeCode.trim();
    const providerCode = draft.providerCode.trim();
    if (!ROUTE_CODE.test(routeCode)) {
      return { error: `${label}: route code must start with a lowercase letter and use lowercase letters, numbers, underscores, or hyphens.` };
    }
    if (codes.has(routeCode)) return { error: `${label}: route code "${routeCode}" is duplicated.` };
    codes.add(routeCode);
    if (!ROUTE_CODE.test(providerCode)) {
      return { error: `${label}: provider code must start with a lowercase letter and use lowercase letters, numbers, underscores, or hyphens.` };
    }
    const priority = Number(draft.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 32767) {
      return { error: `${label}: priority must be a whole number from 0 to 32767.` };
    }

    let executorConfig: unknown;
    try {
      executorConfig = JSON.parse(draft.executorConfig || "{}");
    } catch {
      return { error: `${label}: executor configuration must contain valid JSON.` };
    }
    if (!executorConfig || typeof executorConfig !== "object" || Array.isArray(executorConfig)) {
      return { error: `${label}: executor configuration must be a JSON object.` };
    }

    rows.push({
      route_code: routeCode,
      provider_code: providerCode,
      provider_product_code: draft.providerProductCode.trim() || null,
      execution_pool: draft.executionPool.trim() || null,
      priority,
      credential_secret_name: draft.credentialSecretName.trim() || null,
      executor_config: executorConfig as JsonObject,
    });
  }
  return { rows };
}
