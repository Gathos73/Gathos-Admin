export type ContentKind = "blog" | "compare" | "skill" | "agent" | "alternatives" | "industry" | "voice";
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type ContentData = { [key: string]: Value };
export type Draft = {
  id: string; title: string; type: ContentKind; slug: string | null; topic: string; status: string;
  data: ContentData; updated_at: string; has_unpublished_changes: boolean; error: string | null;
  versions: { data: ContentData; published_at: string }[];
};
export const CONTENT_LABELS: Record<ContentKind, string> = {
  blog: "Blog", compare: "Comparison", skill: "Workflow", agent: "Agent", alternatives: "Alternatives", industry: "Industry", voice: "Voice / language",
};
export async function editorialApi<T>(path: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/backend/api/admin/${path}`, {
    method: body === undefined ? "GET" : method, credentials: "same-origin", cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error || `Request failed (${response.status})`);
  return data as T;
}
