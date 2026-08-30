import type {
  JsonObject,
  ResourceConfig,
  ResourceKey,
  ResourceListResponse,
  ResourceQuery,
  ResourceRecordResponse,
} from "./types";

const BACKEND_PROXY = "/api/backend";

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

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  return `${BACKEND_PROXY}/api/admin/data/${resource}?${parameters.toString()}`;
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
    `${BACKEND_PROXY}/api/admin/data/${resource}/${encodeURIComponent(recordId)}`,
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

export function deleteResource(
  config: ResourceConfig,
  recordId: string,
): Promise<JsonObject> {
  return apiFetch<JsonObject>(mutationPath(config, recordId), {
    method: config.mutations.deleteMethod ?? "DELETE",
  });
}
