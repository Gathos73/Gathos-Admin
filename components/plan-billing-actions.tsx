"use client";

import { useEffect, useRef, useState } from "react";
import { invitePlanUser, listResource, retryPlanBilling } from "@/lib/api";
import type { ResourceRecord } from "@/lib/types";
import { useDialogFocus } from "./use-dialog-focus";

export function PlanBillingActions({ plan, onChanged, onRefresh }: { plan: ResourceRecord; onChanged: (message: string) => void; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ResourceRecord[]>([]);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");
  const dialogRef = useDialogFocus<HTMLElement>({ open, onEscape: busy ? undefined : () => setOpen(false) });
  const status = String(plan.billing_sync_status || "not_requested");
  const canInvite = !plan.retired_at && Number(plan.price_minor) > 0 && plan.billing_provider === "dodo" && Boolean(plan.provider_price_id)
    && !["pending", "syncing", "failed", "uncertain"].includes(status);

  useEffect(() => {
    if (!["pending", "syncing"].includes(status)) return;
    const timer = setTimeout(onRefresh, 5000);
    return () => clearTimeout(timer);
  }, [status, onRefresh]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      void listResource("users", { page: 1, pageSize: 50, search: query, searchField: "email", orderBy: "email", descending: false }, controller.signal)
        .then((response) => { setUsers(response.rows); setLoading(false); })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Could not load users."); setLoading(false); }
        });
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, query]);

  async function send() {
    setBusy(true); setError("");
    try {
      const result = await invitePlanUser(String(plan.id), userId, requestId.current);
      setOpen(false);
      onChanged(`Plan invitation sent to ${result.email}. Access activates after payment.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation could not be sent."); }
    finally { setBusy(false); }
  }

  async function retry() {
    setBusy(true); setError("");
    try { await retryPlanBilling(String(plan.id)); onChanged("Billing sync retry queued. Refresh to see its status."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Retry failed."); }
    finally { setBusy(false); }
  }

  return <section className="record-summary" aria-label="Plan billing">
    <div><span>Dodo billing</span><strong>{plan.provider_price_id ? `Linked: ${String(plan.provider_price_id)}` : status.replaceAll("_", " ")}</strong>
      {plan.billing_sync_error ? <p role="alert">{String(plan.billing_sync_error)}</p> : null}
      {status === "not_requested" && !plan.provider_price_id ? <p>Link a Dodo product before inviting a user.</p> : null}
    </div>
    <div className="dialog-actions">
      {["failed", "uncertain", "pending"].includes(status) && !plan.retired_at ? <button className="button button--secondary" type="button" disabled={busy} onClick={() => void retry()}>Retry billing sync</button> : null}
      <button className="button button--primary" type="button" disabled={!canInvite || busy} onClick={() => {
        requestId.current = crypto.randomUUID(); setUserId(""); setQuery(""); setError(""); setOpen(true);
      }}>Invite user</button>
    </div>
    {error && !open ? <p role="alert">{error}</p> : null}
    {open ? <div className="modal-backdrop"><section ref={dialogRef} tabIndex={-1} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-invite-title">
      <h2 id="plan-invite-title">Invite user to {String(plan.display_name)}</h2>
      <p>The user will receive payment details and a secure checkout link by email. Successful payment activates this plan on their profile and cancels future renewals of their previous subscription.</p>
      <label className="form-field">Search by email<input type="search" value={query} disabled={busy} onChange={(event) => { setQuery(event.target.value); setUserId(""); requestId.current = crypto.randomUUID(); }} /></label>
      <label className="form-field">User<select value={userId} disabled={busy || loading} onChange={(event) => { setUserId(event.target.value); requestId.current = crypto.randomUUID(); }}>
        <option value="">{loading ? "Loading…" : "Choose a user"}</option>
        {users.map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.email)}{user.name ? ` — ${String(user.name)}` : ""}</option>)}
      </select></label>
      <p>Showing up to 50 matches. Search to find another user.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions"><button className="button button--secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="button button--primary" type="button" disabled={busy || !userId} onClick={() => void send()}>{busy ? "Sending…" : "Send"}</button></div>
    </section></div> : null}
  </section>;
}
