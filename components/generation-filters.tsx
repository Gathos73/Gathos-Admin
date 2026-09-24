"use client";

import { useEffect, useState } from "react";
import { listResource } from "../lib/api";
import type { SelectOption } from "../lib/types";

type Filters = { search: string; searchField: string; plan: string; product: string; createdFrom: string; createdTo: string };

function localDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function GenerationFilters({ initial, searchFields, onApply }: {
  initial: Filters;
  searchFields: SelectOption[];
  onApply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState({ ...initial, createdFrom: localDate(initial.createdFrom), createdTo: localDate(initial.createdTo) });
  const [options, setOptions] = useState<{ plans: SelectOption[]; products: SelectOption[] }>({ plans: [], products: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function loadOptions(resource: "plans" | "products") {
      const result: SelectOption[] = [];
      for (let page = 1; ; page++) {
        const data = await listResource(resource, { page, pageSize: 200, orderBy: "code", descending: false }, controller.signal);
        result.push(...data.rows.map((row) => ({ value: String(row.code), label: String(row.display_name || row.name || row.code) })));
        if (!data.pagination.has_more) return result;
      }
    }
    Promise.all([loadOptions("plans"), loadOptions("products")])
      .then(([plans, products]) => { if (!controller.signal.aborted) setOptions({ plans, products }); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load filter options. Reload the page to try again."); });
    return () => controller.abort();
  }, []);
  return <form className="filter-form generation-filter-form" onSubmit={(event) => {
    event.preventDefault();
    onApply({ ...draft, search: draft.search.trim(), createdFrom: draft.createdFrom ? new Date(draft.createdFrom).toISOString() : "", createdTo: draft.createdTo ? new Date(draft.createdTo).toISOString() : "" });
  }}>
    <label>Search<input type="search" placeholder="Search user email…" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
    <label>Search field<select value={draft.searchField} onChange={(event) => setDraft({ ...draft, searchField: event.target.value })}>{searchFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}</select></label>
    {(["plan", "product"] as const).map((field) => <label key={field}>{field === "plan" ? "Plan" : "Product"}<select value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}>
      <option value="">{field === "plan" ? "All plans" : "All products"}</option>
      {draft[field] && !options[`${field}s`].some((option) => option.value === draft[field]) ? <option value={draft[field]}>{draft[field]}</option> : null}
      {options[`${field}s`].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>)}
    <label>From (local time)<input type="datetime-local" value={draft.createdFrom} max={draft.createdTo || undefined} onChange={(event) => setDraft({ ...draft, createdFrom: event.target.value })} /></label>
    <label>Until (local time)<input type="datetime-local" value={draft.createdTo} min={draft.createdFrom || undefined} onChange={(event) => setDraft({ ...draft, createdTo: event.target.value })} /></label>
    <button className="button button--secondary" type="button" onClick={() => setDraft({ search: "", searchField: "user_email", plan: "", product: "", createdFrom: "", createdTo: "" })}>Clear</button>
    <button className="button button--primary" type="submit">Apply filters</button>
    {error ? <span role="alert">{error}</span> : null}
  </form>;
}
