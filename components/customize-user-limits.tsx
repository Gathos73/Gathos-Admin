"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { customizeUserLimits, getUserLimits, type UserLimits } from "@/lib/api";
import { PlanLimitsCreateInline } from "./plan-limits-inline";
import { serializePlanLimitDrafts, type ProductLimitDraft } from "@/lib/catalog-inline-drafts";
import type { JsonObject } from "@/lib/types";

const overallFields = [
  { key: "plan_fixed_window_limit", label: "Overall generation limit", example: "1000", min: 0,
    help: "Accepted generations across all products in each 4-hour UTC window. Product limits also apply." },
  { key: "plan_queue_depth_limit", label: "Overall queue depth limit", example: "20", min: 0,
    help: "Generations waiting for acceptance across all products." },
  { key: "plan_concurrency_limit", label: "Overall concurrency limit", example: "5", min: 1,
    help: "Accepted generations active at the same time across all products." },
] as const;
type OverallKey = typeof overallFields[number]["key"];

export function CustomizeUserLimits({ userId }: { userId: string }) {
  const router = useRouter();
  const [data, setData] = useState<UserLimits | null>(null);
  const [overall, setOverall] = useState<Record<OverallKey, string>>({
    plan_fixed_window_limit: "", plan_queue_depth_limit: "", plan_concurrency_limit: "",
  });
  const [products, setProducts] = useState<ProductLimitDraft[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const saving = useRef(false);
  const userPath = `/users/${encodeURIComponent(userId)}`;

  useEffect(() => {
    const controller = new AbortController();
    void getUserLimits(userId, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setData(response);
      setOverall({
        plan_fixed_window_limit: String(response.plan_fixed_window_limit ?? ""),
        plan_queue_depth_limit: String(response.plan_queue_depth_limit ?? ""),
        plan_concurrency_limit: String(response.plan_concurrency_limit ?? ""),
      });
      setProducts(response.product_limits.map((row) => ({
        draftKey: row.product_id, productId: row.product_id, productCode: row.code, productName: row.name,
        fixedWindowLimit: String(row.fixed_window_limit ?? ""), queueDepthLimit: String(row.queue_depth_limit ?? ""),
        concurrencyLimit: String(row.concurrency_limit ?? ""), deleteRequested: false,
      })));
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load the user's limits.");
    });
    return () => controller.abort();
  }, [userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || saving.current) return;
    setError("");
    const payload: JsonObject = { expected_entitlement_id: data.entitlement_id };
    for (const field of overallFields) {
      const raw = overall[field.key].trim();
      const value = raw === "" ? null : Number(raw);
      if (value !== null && (!Number.isInteger(value) || value < field.min || value > 2147483647)) {
        setError(`${field.label} must be a whole number from ${field.min} to 2147483647, or blank for unlimited.`);
        return;
      }
      payload[field.key] = value;
    }
    const productLimits = serializePlanLimitDrafts(products, data.product_limits.map((row) => row.product_id), 0);
    if (productLimits.error) { setError(productLimits.error); return; }
    payload.product_limits = productLimits.rows ?? [];
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    payload.request_id = request.current.id;
    saving.current = true;
    setSubmitting(true);
    try {
      await customizeUserLimits(userId, payload);
      router.push(userPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the limits.");
      saving.current = false;
      setSubmitting(false);
    }
  }

  return <div className="record-page">
    <nav className="record-page-breadcrumbs" aria-label="Breadcrumb">
      <Link href="/users">Users</Link><span>/</span><Link href={userPath}>{data?.user.email || "User"}</Link>
      <span>/</span><span aria-current="page">Customize limits</span>
    </nav>
    <header className="record-page-header">
      <div>
        <p className="resource-eyebrow">User limits</p><h1>Customize limits</h1>
        <p>Save a private copy of this user’s current plan with the limits below and assign it immediately. Billing stays the same.</p>
      </div>
      <Link className="button button--secondary" href={userPath}>Back to user</Link>
    </header>
    {error ? <div className="form-error form-error--summary" role="alert">{error}</div> : null}
    {!data && !error ? <p role="status">Loading current limits…</p> : null}
    {data ? <>
      <section className="record-page-panel">
        <header className="record-page-panel-header"><div>
          <h2>{data.user.email}</h2>
          <p>Current plan: {data.plan.display_name}</p>
          <p>Private plan: {data.custom_plan.display_name}</p>
        </div></header>
      </section>
      <section className="record-page-panel">
      <header className="record-page-panel-header"><div>
        <h2>Generation limits</h2><p>These limits apply to this user’s playground and API generations.</p>
      </div></header>
      <div className="record-page-panel-body">
      <form className="record-form" onSubmit={save}>
        <fieldset disabled={submitting}>
          <legend className="form-label">Overall limits</legend>
          <p className="form-help">All limits are optional. Leave a field blank for unlimited.</p>
          <div className="form-grid">
            {overallFields.map((field) => <label className="form-field form-field--number" key={field.key}>
              <span className="form-label">{field.label} <span className="form-field-requirement">(Optional)</span></span>
              <input type="number" min={field.min} max={2147483647} step={1} value={overall[field.key]}
                placeholder={`e.g. ${field.example} (blank: unlimited)`} aria-describedby={`${field.key}-help`}
                onChange={(event) => setOverall({ ...overall, [field.key]: event.target.value })} />
              <span id={`${field.key}-help`} className="form-help">{field.help}</span>
            </label>)}
          </div>
        </fieldset>
        <PlanLimitsCreateInline allowedProducts={data.product_limits.map((row) => ({ id: row.product_id, code: row.code, name: row.name }))}
          drafts={products} onChange={setProducts} submitting={submitting} error="" concurrencyMinimum={0} />
        <div className="drawer-actions">
          <button className="button button--secondary" type="button" disabled={submitting} onClick={() => router.push(userPath)}>Cancel</button>
          <button className="button button--primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save limits"}</button>
        </div>
      </form>
      </div>
      </section>
    </> : null}
  </div>;
}
