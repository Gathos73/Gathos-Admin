export type ServiceType = "image" | "image_to_image" | "tts" | "video" | "music";
export type ComputeState = "enabled" | "draining" | "disabled" | "retired";

export const SERVICE_TYPES: Record<ServiceType, { label: string; adapter: string; pool: string }> = {
  image: { label: "Image", adapter: "image_jobs_v1", pool: "t2i:api-v1" },
  image_to_image: { label: "Image to image", adapter: "klein_generate_v1", pool: "i2i:api-v1" },
  tts: { label: "Text to speech", adapter: "tts_jobs_v1", pool: "tts:api-v1" },
  video: { label: "Video", adapter: "ltx_jobs_v1", pool: "ltx23:fp8:api-v1" },
  music: { label: "Music", adapter: "music_jobs_v1", pool: "music:api-v1" },
};

export type CollectorWrite = {
  base_url: string; server_id: string; credential_ref: string;
  status_path: "/v1/status"; metrics_path: "/metrics";
};
export type ServiceWrite = {
  service_id?: string; service_type: ServiceType; desired_state: ComputeState;
  adapter: string; pool_key: string; model_id: string; model_revision: string;
  base_url: string; health_path: string; credential_ref: string | null;
  recovery_mode: "reconcile_only";
};
export type GpuWrite = {
  name: string; host_ref: string | null; hardware_uuid: string | null;
  gpu_model: string | null; vram_mib: number | null; desired_state: ComputeState;
  collector: CollectorWrite; services: ServiceWrite[];
};
export type RegisteredService = ServiceWrite & { service_id: string; version: number };
export type RegisteredGpu = Omit<GpuWrite, "services"> & {
  gpu_id: string; revision: number; etag: string; services: RegisteredService[];
  sharing_policy: "exclusive"; max_active_jobs: 1; created_at: string; updated_at: string;
  reservation: { reservation_id: string; state: string; expires_at: string } | null;
};
export type GpuList = { items: RegisteredGpu[]; next_cursor: string | null };
export type CredentialWrite = { label: string; headers: { "X-API-Key"?: string; Authorization?: string } };
export type CredentialDraft = { mode: "new" | "existing" | "none"; reference: string; apiKey: string; authorization: string };
export type ServiceDraft = Omit<ServiceWrite, "credential_ref"> & { draftId: string; credential: CredentialDraft };
export type GpuDraft = Omit<GpuWrite, "vram_mib" | "collector" | "services"> & {
  vram: string;
  collector: Omit<CollectorWrite, "credential_ref"> & { credential: CredentialDraft };
  services: ServiceDraft[];
};

export function credentialDraft(reference?: string | null, required = false): CredentialDraft {
  return { mode: reference ? "existing" : required ? "new" : "none", reference: reference ?? "", apiKey: "", authorization: "" };
}

export function newService(draftId: string, type: ServiceType = "image"): ServiceDraft {
  return {
    draftId, service_type: type, adapter: SERVICE_TYPES[type].adapter, pool_key: SERVICE_TYPES[type].pool,
    desired_state: "enabled", model_id: "", model_revision: "", base_url: "", health_path: "/health",
    recovery_mode: "reconcile_only", credential: credentialDraft(),
  };
}

export function gpuDraft(record?: RegisteredGpu): GpuDraft {
  return {
    name: record?.name ?? "", host_ref: record?.host_ref ?? "", hardware_uuid: record?.hardware_uuid ?? "",
    gpu_model: record?.gpu_model ?? "", vram: record?.vram_mib?.toString() ?? "", desired_state: record?.desired_state ?? "enabled",
    collector: {
      base_url: record?.collector.base_url ?? "", server_id: record?.collector.server_id ?? "",
      status_path: "/v1/status", metrics_path: "/metrics", credential: credentialDraft(record?.collector.credential_ref, true),
    },
    services: record ? record.services.map((service) => ({
      ...serviceWrite(service), draftId: service.service_id, credential: credentialDraft(service.credential_ref),
    })) : [newService("initial")],
  };
}

// Explicit projections keep response-only fields out of strict backend PUT bodies.
export function serviceWrite(service: ServiceWrite): ServiceWrite {
  return {
    ...(service.service_id ? { service_id: service.service_id } : {}),
    service_type: service.service_type, desired_state: service.desired_state, adapter: service.adapter,
    pool_key: service.pool_key.trim(), model_id: service.model_id.trim(), model_revision: service.model_revision.trim(),
    base_url: service.base_url.trim().replace(/\/+$/, ""), health_path: service.health_path.trim(),
    credential_ref: service.credential_ref, recovery_mode: "reconcile_only",
  };
}

function plainEndpoint(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return /^https?:\/\//.test(raw) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      && !/[\s\\]/.test(raw);
  } catch { return false; }
}

function credentialError(value: CredentialDraft, required: boolean): string | null {
  if (value.mode === "none") return required ? "Collector credentials are required." : null;
  if (value.mode === "existing") return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.reference.trim())
    ? null : "Enter a valid saved credential ID.";
  if (!value.apiKey && !value.authorization) return "Enter an API key or Authorization header.";
  if ([value.apiKey, value.authorization].some((v) => v.length > 4096 || /[^\x20-\x7e]/.test(v))) return "Credentials must contain printable characters and be at most 4096 characters.";
  return null;
}

export function validateGpuDraft(draft: GpuDraft): string | null {
  if (!draft.name.trim()) return "Enter a GPU name.";
  if (!plainEndpoint(draft.collector.base_url.trim())) return "Enter an HTTP(S) collector URL without embedded credentials, query parameters or fragments.";
  if (!draft.collector.server_id.trim()) return "Enter the collector server ID.";
  if (draft.vram && (!Number.isSafeInteger(Number(draft.vram)) || Number(draft.vram) < 1)) return "VRAM must be a positive whole number in MiB.";
  const collectorError = credentialError(draft.collector.credential, true);
  if (collectorError) return `Collector: ${collectorError}`;
  if (!draft.services.length || draft.services.length > 100) return "A GPU needs between one and 100 services.";
  for (const [index, service] of draft.services.entries()) {
    const label = `Service ${index + 1}`;
    if (!service.model_id.trim() || !service.model_revision.trim()) return `${label}: enter the model ID and revision.`;
    if (!plainEndpoint(service.base_url.trim())) return `${label}: enter an HTTP(S) service URL without embedded credentials, query parameters or fragments.`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(service.pool_key.trim())) return `${label}: enter a valid execution pool.`;
    if (!service.health_path.startsWith("/") || /[?#\\]/.test(service.health_path)) return `${label}: enter an absolute health path, such as /health.`;
    const error = credentialError(service.credential, false);
    if (error) return `${label}: ${error}`;
  }
  return null;
}

export async function prepareGpuWrite(
  draft: GpuDraft,
  resolve: (credential: CredentialDraft, label: string) => Promise<string | null>,
): Promise<GpuWrite> {
  const error = validateGpuDraft(draft);
  if (error) throw new Error(error);
  const collectorRef = await resolve(draft.collector.credential, `${draft.name} collector`.slice(0, 160));
  if (!collectorRef) throw new Error("Collector credentials are required.");
  const services: ServiceWrite[] = [];
  for (const [index, service] of draft.services.entries()) {
    const reference = await resolve(service.credential, `${draft.name} ${SERVICE_TYPES[service.service_type].label} ${index + 1}`.slice(0, 160));
    services.push(serviceWrite({ ...service, credential_ref: reference }));
  }
  return {
    name: draft.name.trim(), host_ref: draft.host_ref?.trim() || null, hardware_uuid: draft.hardware_uuid?.trim() || null,
    gpu_model: draft.gpu_model?.trim() || null, vram_mib: draft.vram ? Number(draft.vram) : null, desired_state: draft.desired_state,
    collector: { base_url: draft.collector.base_url.trim().replace(/\/+$/, ""), server_id: draft.collector.server_id.trim(),
      status_path: "/v1/status", metrics_path: "/metrics", credential_ref: collectorRef }, services,
  };
}

/** Retry ambiguous credential creation with the same key; secrets stay in form memory only. */
export class CredentialSession {
  private requests = new Map<string, { key: string; reference?: string }>();
  async resolve(value: CredentialDraft, label: string, create: (body: CredentialWrite, key: string) => Promise<{ credential_ref: string }>): Promise<string | null> {
    if (value.mode === "none") return null;
    if (value.mode === "existing") return value.reference.trim();
    const body: CredentialWrite = { label, headers: {
      ...(value.apiKey ? { "X-API-Key": value.apiKey } : {}), ...(value.authorization ? { Authorization: value.authorization } : {}),
    } };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const attempt = this.requests.get(fingerprint) ?? { key: crypto.randomUUID() };
    this.requests.set(fingerprint, attempt);
    if (!attempt.reference) attempt.reference = (await create(body, attempt.key)).credential_ref;
    return attempt.reference;
  }
}

/** Recognize a committed PUT after a lost reply without repeating additions. */
export function matchesGpuWrite(record: RegisteredGpu, expected: GpuWrite): boolean {
  for (const field of ["name", "host_ref", "hardware_uuid", "gpu_model", "vram_mib", "desired_state"] as const) {
    if (record[field] !== expected[field]) return false;
  }
  if (Object.entries(expected.collector).some(([key, value]) => record.collector[key as keyof CollectorWrite] !== value)) return false;
  const remaining = record.services.map(serviceWrite);
  for (const incoming of expected.services) {
    const found = remaining.findIndex((item) => Object.entries(incoming).every(([key, value]) => item[key as keyof ServiceWrite] === value));
    if (found < 0) return false;
    remaining.splice(found, 1);
  }
  return remaining.length === 0;
}

export function computeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "The registry request failed. Please try again.";
  return ({
    gpu_revision_changed: "This GPU was changed by another administrator. Reload the saved record before editing again.",
    pool_model_mismatch: "This execution pool already uses a different model or revision. Use the matching model or choose a new pool.",
    compute_endpoint_host_not_allowed: "The backend has not approved this endpoint host. Add the GPU host or IP range to its registry allowlist.",
    compute_encryption_not_configured: "The backend registry encryption key must be configured before saving credentials.",
    credential_not_found: "A saved credential could not be found. Check its ID or enter new credentials.",
    gpu_identity_conflict: "A GPU with this hardware identity is already registered.",
    drain_required: "Drain this GPU or service and let its current job finish before disabling it.",
    collector_change_requires_idle_gpu: "The collector cannot be changed while this GPU has an active reservation.",
    gpu_retired: "This GPU has been permanently retired.",
    service_retired: "A retired service cannot be changed or enabled again.",
  } as Record<string, string>)[message] ?? message;
}
