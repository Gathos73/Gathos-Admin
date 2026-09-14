import { cachedRequest, clearRequestCache } from "./request-cache";
import type { CredentialWrite, GpuList, GpuWrite, RegisteredGpu } from "./compute-registry";

import type {
  JsonObject,
  ResourceConfig,
  ResourceKey,
  ResourceListResponse,
  ResourceQuery,
  ResourceRecordResponse,
} from "./types";

const BACKEND_PROXY = "/api/backend";

export type ResourceMetrics = {
  cpu_percent: number | null; uptime_seconds: number | null;
  memory: { total_bytes: number | null; used_bytes: number | null; used_percent: number | null };
  swap: { total_bytes: number | null; used_bytes: number | null; used_percent: number | null };
  network: { bytes_sent_per_second: number | null; bytes_received_per_second: number | null };
  disks: { path: string; total_bytes: number | null; used_bytes: number | null; used_percent: number | null }[];
  devices: { name: string; hardware_uuid: string; utilization_percent: number | null; memory_used_mib: number | null; memory_total_mib: number | null; memory_used_percent: number | null; temperature_celsius: number | null; power_watts: number | null }[];
};
export type GpuReading = {
  health: "healthy" | "degraded" | "stale" | "unavailable" | "identity_mismatch";
  sampled_at: string | null; metrics: ResourceMetrics | null;
};
export type MonitoredGpu = GpuReading & {
  gpu_id: string; revision: number; name: string; gpu_model: string | null; hardware_uuid: string | null;
  server_id: string; desired_state: string; reservation_state: string | null;
  services: { service_id: string; service_type: string; desired_state: string }[];
};
export type GpuHealthSnapshot = {
  items: MonitoredGpu[]; total: number; observed_at: string; next_after_id: string | null;
};
export type GpuHistory = {
  items: (GpuReading & { id: number })[]; start: string; end: string; next_after_id: number | null; retention_days: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const body = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
    if (key === "detail" && Array.isArray(value)) {
      const issue = value.find(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
      );
      if (issue && typeof issue.msg === "string") {
        const location = Array.isArray(issue.loc)
          ? issue.loc.filter((part) => part !== "body").join(".")
          : "";
        return location ? `${location}: ${issue.msg}` : issue.msg;
      }
    }
  }
  return fallback;
}

function redirectUnauthorized(): void {
  if (typeof window === "undefined") return;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?return_to=${encodeURIComponent(returnTo)}`);
}

export { clearRequestCache } from "./request-cache";

async function apiFetch<T>(path: string, init: RequestInit = {}, force = false): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET" && typeof window !== "undefined") {
    return cachedRequest(
      path,
      () => uncachedApiFetch<T>(path, { ...init, signal: undefined }),
      init.signal,
      force,
    );
  }
  clearRequestCache();
  try { return await uncachedApiFetch<T>(path, init); }
  finally { clearRequestCache(); }
}

async function uncachedApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "Unable to reach the backend.",
      0,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (response.status === 401 || response.status === 403) clearRequestCache();
  if (response.status === 401) {
    redirectUnauthorized();
    throw new ApiError("Your session has expired. Redirecting to sign in…", 401, payload);
  }
  if (response.status === 403) {
    throw new ApiError(
      errorMessage(payload, "You do not have permission to perform this action."),
      403,
      payload,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload,
    );
  }

  return payload as T;
}

function listPath(resource: ResourceKey, query: ResourceQuery): string {
  const parameters = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    order_by: query.orderBy,
    descending: String(query.descending),
  });
  if (query.search) parameters.set("search", query.search);
  if (query.searchField) parameters.set("search_field", query.searchField);
  if (query.filterBy && query.filterValue !== undefined) {
    parameters.set("filter_by", query.filterBy);
    parameters.set("filter_value", query.filterValue);
  }
  return `${BACKEND_PROXY}/api/admin/resources/${resource}?${parameters.toString()}`;
}

function mutationPath(config: ResourceConfig, recordId?: string): string {
  const base = `${BACKEND_PROXY}/api/admin${config.mutations.basePath}`;
  return recordId === undefined ? base : `${base}/${encodeURIComponent(recordId)}`;
}

export function listResource(
  resource: ResourceKey,
  query: ResourceQuery,
  signal?: AbortSignal,
): Promise<ResourceListResponse> {
  return apiFetch<ResourceListResponse>(listPath(resource, query), { signal });
}

export function getResourceRecord(
  resource: ResourceKey,
  recordId: string,
  signal?: AbortSignal,
): Promise<ResourceRecordResponse> {
  return apiFetch<ResourceRecordResponse>(
    `${BACKEND_PROXY}/api/admin/resources/${resource}/${encodeURIComponent(recordId)}`,
    { signal },
  );
}

export function createResource(
  config: ResourceConfig,
  payload: JsonObject,
): Promise<JsonObject> {
  return apiFetch<JsonObject>(mutationPath(config), {
    method: config.mutations.createMethod ?? "POST",
    body: JSON.stringify(payload),
  });
}

export function updateResource(
  config: ResourceConfig,
  recordId: string,
  payload: JsonObject,
): Promise<JsonObject> {
  return apiFetch<JsonObject>(mutationPath(config, recordId), {
    method: config.mutations.updateMethod ?? "PATCH",
    body: JSON.stringify(payload),
  });
}

export function setUserPassword(userId: string, password: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `${BACKEND_PROXY}/api/admin/users/${encodeURIComponent(userId)}/password`,
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

export function invitePlanUser(planId: string, userId: string, requestId: string): Promise<{ ok: boolean; email: string }> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/plans/${encodeURIComponent(planId)}/invite`, {
    method: "POST", body: JSON.stringify({ user_id: userId, request_id: requestId }),
  });
}

export function retryPlanBilling(planId: string): Promise<{ ok: boolean }> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/plans/${encodeURIComponent(planId)}/retry-billing-sync`, { method: "POST" });
}

export function deleteResource(
  config: ResourceConfig,
  recordId: string,
): Promise<JsonObject> {
  return apiFetch<JsonObject>(mutationPath(config, recordId), {
    method: config.mutations.deleteMethod ?? "DELETE",
  });
}

export function getResourceCount(resource: ResourceKey): Promise<{ total: number }> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/resources/${resource}/count`);
}

export function getGpuHealth(signal?: AbortSignal, afterId?: string): Promise<GpuHealthSnapshot> {
  return apiFetch<GpuHealthSnapshot>(
    `${BACKEND_PROXY}/api/admin/gpu-health${afterId ? `?after_id=${encodeURIComponent(afterId)}` : ""}`,
    { signal },
    true,
  );
}

export function getGpuHistory(id: string, start: string, end: string, afterId = 0, signal?: AbortSignal): Promise<GpuHistory> {
  const query = new URLSearchParams({ start, end, after_id: String(afterId) });
  return apiFetch(`${BACKEND_PROXY}/api/admin/gpu-health/${encodeURIComponent(id)}/history?${query}`, { signal }, true);
}

export function listComputeGpus(afterId?: string, signal?: AbortSignal): Promise<GpuList> {
  const query = new URLSearchParams({ limit: "50" });
  if (afterId) query.set("after_id", afterId);
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/gpus?${query}`, { signal }, true);
}

export function getComputeGpu(id: string, signal?: AbortSignal): Promise<RegisteredGpu> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/gpus/${encodeURIComponent(id)}`, { signal }, true);
}

export function createComputeCredential(body: CredentialWrite, key: string): Promise<{ credential_ref: string }> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/credentials`, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body),
  });
}

export function createComputeGpu(body: GpuWrite, key: string): Promise<RegisteredGpu> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/gpus`, {
    method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body),
  });
}

export function updateComputeGpu(id: string, body: GpuWrite, etag: string): Promise<RegisteredGpu> {
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/gpus/${encodeURIComponent(id)}`, {
    method: "PUT", headers: { "If-Match": etag }, body: JSON.stringify(body),
  });
}

export function drainComputeGpu(id: string, etag: string, serviceId?: string): Promise<RegisteredGpu> {
  const suffix = serviceId ? `/services/${encodeURIComponent(serviceId)}/drain` : "/drain";
  return apiFetch(`${BACKEND_PROXY}/api/admin/compute/gpus/${encodeURIComponent(id)}${suffix}`, {
    method: "POST", headers: { "If-Match": etag },
  });
}

export type OverviewTimeWindow = "current_window" | "24h" | "7d";

export type TimelinePoint = {
  timestamp: string;
  local_timestamp: string;
  label: string;
  count: number;
  breakdown: Record<string, number>;
};

export type OverviewTimelineResponse = {
  time_window: OverviewTimeWindow;
  window_label: string;
  window_index: number;
  start_time: string;
  end_time: string;
  interval: string;
  product: string;
  total_generations: number;
  peak_count: number;
  active_users: number;
  points: TimelinePoint[];
};

export type OverviewUserStat = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  plan_name: string;
  plan_code: string;
  generation_count: number;
  breakdown: Record<string, number>;
  last_active: string | null;
};

export type OverviewUserStatsResponse = {
  time_window: OverviewTimeWindow;
  window_label: string;
  window_index: number;
  product: string;
  page: number;
  page_size: number;
  total_users: number;
  total_pages: number;
  users: OverviewUserStat[];
};

export type OverviewProduct = {
  code: string;
  name: string;
};

export function getOverviewProducts(signal?: AbortSignal): Promise<{ products: OverviewProduct[] }> {
  return apiFetch<{ products: OverviewProduct[] }>(
    `${BACKEND_PROXY}/api/admin/overview/products`,
    { signal },
  );
}

export function getOverviewTimeline(
  params: {
    timeWindow: OverviewTimeWindow;
    product?: string;
    tzOffset?: number;
  },
  signal?: AbortSignal,
): Promise<OverviewTimelineResponse> {
  const q = new URLSearchParams({
    time_window: params.timeWindow,
    product: params.product ?? "all",
    tz_offset: String(params.tzOffset ?? new Date().getTimezoneOffset()),
  });
  return apiFetch<OverviewTimelineResponse>(
    `${BACKEND_PROXY}/api/admin/overview/timeline?${q.toString()}`,
    { signal },
    true,
  );
}

export function getOverviewUserStats(
  params: {
    timeWindow: OverviewTimeWindow;
    product?: string;
    tzOffset?: number;
    page?: number;
    pageSize?: number;
    search?: string;
    orderBy?: string;
    descending?: boolean;
    activeOnly?: boolean;
  },
  signal?: AbortSignal,
): Promise<OverviewUserStatsResponse> {
  const q = new URLSearchParams({
    time_window: params.timeWindow,
    product: params.product ?? "all",
    tz_offset: String(params.tzOffset ?? new Date().getTimezoneOffset()),
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 10),
  });
  if (params.search) q.set("search", params.search);
  if (params.orderBy) q.set("order_by", params.orderBy);
  if (params.descending !== undefined) q.set("descending", String(params.descending));
  if (params.activeOnly !== undefined) q.set("active_only", String(params.activeOnly));

  return apiFetch<OverviewUserStatsResponse>(
    `${BACKEND_PROXY}/api/admin/overview/user-stats?${q.toString()}`,
    { signal },
    true,
  );
}
