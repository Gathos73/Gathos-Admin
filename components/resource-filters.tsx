"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListFilter } from "lucide-react";
import type { ResourceFilter, SelectOption } from "../lib/types";
import { CloseIcon, SearchIcon } from "./icons";
import { useDialogFocus } from "./use-dialog-focus";

export interface AppliedResourceFilters {
  search: string;
  searchField: string;
  filters: Record<string, string>;
  createdFrom: string;
  createdTo: string;
}

function localDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ResourceFilters({ label, searchFields, filters, applied, open, onOpenChange, onApply, optionsError, showCreatedDate = true, quickFilterName }: {
  label: string;
  searchFields: SelectOption[];
  filters: ResourceFilter[];
  applied: AppliedResourceFilters;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (next: AppliedResourceFilters) => void;
  optionsError?: string;
  showCreatedDate?: boolean;
  quickFilterName?: string;
}) {
  const [search, setSearch] = useState(applied.search);
  const [searchField, setSearchField] = useState(applied.searchField);
  const [draftFilters, setDraftFilters] = useState(applied.filters);
  const [createdFrom, setCreatedFrom] = useState(localDate(applied.createdFrom));
  const [createdTo, setCreatedTo] = useState(localDate(applied.createdTo));
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialogFocus<HTMLElement>({ open, onEscape: () => onOpenChange(false) });
  const activeCount = Object.values(applied.filters).filter(Boolean).length + Number(Boolean(applied.createdFrom || applied.createdTo));
  const quickFilter = filters.find((filter) => filter.name === quickFilterName);
  const quickOptions = quickFilter?.options?.map((option) => ({ ...option, label:
    quickFilter.name === "is_active" ? option.value === "true" ? "Active" : "Inactive"
    : quickFilter.name === "is_suspended" ? option.value === "true" ? "Suspended" : "Active"
    : option.label,
  }));
  const hasApplied = Boolean(applied.search || activeCount);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || open ||
        target?.closest("input, select, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    const previousOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", focusSearch);
    return () => {
      document.removeEventListener("keydown", focusSearch);
      if (open) document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function apply(next: AppliedResourceFilters, focusSelector: string) {
    onApply(next);
    // Applying updates the URL and remounts this toolbar with the new values.
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(focusSelector)?.focus());
  }

  function openFilters() {
    setDraftFilters(applied.filters);
    setCreatedFrom(localDate(applied.createdFrom));
    setCreatedTo(localDate(applied.createdTo));
    onOpenChange(true);
  }

  return <>
    <div className="resource-toolbar resource-toolbar--unfold">
      <form className="search-form resource-search" role="search" onSubmit={(event) => {
        event.preventDefault();
        apply({ ...applied, search: search.trim(), searchField }, "[data-resource-search]");
      }}>
        <button aria-label={`Submit search for ${label}`} className="resource-search-submit" type="submit"><SearchIcon size={17} /></button>
        <input data-resource-search aria-label={`Search ${label}`} placeholder="Type to search" ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {searchFields.length > 1 ? <select aria-label="Search field" value={searchField} onChange={(event) => setSearchField(event.target.value)}>
          {searchFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
        </select> : null}
        <kbd aria-hidden="true">/</kbd>
      </form>
      {filters.length || showCreatedDate ? <div className="resource-filter-controls">
        {quickFilter && quickOptions?.length ? <div aria-label={`Filter by ${quickFilter.label.toLowerCase()}`} className="resource-filter-tabs" role="group">
          {[{ value: "", label: "All" }, ...quickOptions].map((option) => <button
            aria-pressed={(applied.filters[quickFilter.name] ?? "") === option.value}
            data-quick-filter className="resource-filter-tab" key={option.value} type="button"
            onClick={() => {
              const next = { ...applied.filters };
              if (option.value) next[quickFilter.name] = option.value;
              else delete next[quickFilter.name];
              apply({ ...applied, filters: next }, '[data-quick-filter][aria-pressed="true"]');
            }}
          >{option.label}</button>)}
        </div> : null}
        <button id="resource-filter-toggle" aria-controls="resource-filter-dialog" aria-expanded={open} className="button button--secondary resource-filter-toggle" onClick={openFilters} type="button">
          Filters {activeCount ? <span className="filter-count">{activeCount}</span> : null}<ListFilter aria-hidden="true" size={16} />
        </button>
      </div> : null}
      {hasApplied ? <div className="applied-resource-filters" aria-label="Applied search and filters">
        {applied.search ? <span className="applied-filter">{searchFields.find((field) => field.value === applied.searchField)?.label}: {applied.search}</span> : null}
        {filters.filter((filter) => applied.filters[filter.name]).map((filter) => <span className="applied-filter" key={filter.name}>
          {filter.label}: {filter.options?.find((option) => option.value === applied.filters[filter.name])?.label ?? applied.filters[filter.name]}
        </span>)}
        {applied.createdFrom || applied.createdTo ? <span className="applied-filter">Created: {applied.createdFrom ? new Date(applied.createdFrom).toLocaleString() : "Any time"} – {applied.createdTo ? new Date(applied.createdTo).toLocaleString() : "Now"}</span> : null}
        <button className="button button--ghost button--small" type="button" onClick={() => apply({ search: "", searchField: searchFields[0]?.value ?? "", filters: {}, createdFrom: "", createdTo: "" }, "[data-resource-search]")}>Clear all</button>
      </div> : null}
    </div>
    {open ? createPortal(<div className="drawer-backdrop filter-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onOpenChange(false);
    }}>
      <aside aria-labelledby="resource-filter-title" aria-modal="true" className="resource-filter-drawer" id="resource-filter-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="drawer-header"><h2 id="resource-filter-title">Filters</h2><button aria-label="Close filters" className="icon-button" onClick={() => onOpenChange(false)} type="button"><CloseIcon size={18} /></button></header>
        <form className="resource-filter-form" onSubmit={(event) => {
          event.preventDefault();
          apply({
            ...applied,
            filters: Object.fromEntries(Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)),
            createdFrom: createdFrom ? new Date(createdFrom).toISOString() : "",
            createdTo: createdTo ? new Date(createdTo).toISOString() : "",
          }, "#resource-filter-toggle");
          onOpenChange(false);
        }}>
          <div className="resource-filter-fields">
            {filters.map((filter) => <label className="resource-filter-field" key={filter.name}>
              <span>By {filter.label.toLowerCase()}</span>
              {filter.options ? <select aria-label={filter.label} value={draftFilters[filter.name] ?? ""} onChange={(event) => setDraftFilters({ ...draftFilters, [filter.name]: event.target.value })}>
                <option value="">All</option>
                {draftFilters[filter.name] && !filter.options.some((option) => option.value === draftFilters[filter.name]) ? <option value={draftFilters[filter.name]}>{draftFilters[filter.name]}</option> : null}
                {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select> : <input aria-label={filter.label} placeholder="Exact value" value={draftFilters[filter.name] ?? ""} onChange={(event) => setDraftFilters({ ...draftFilters, [filter.name]: event.target.value })} />}
            </label>)}
            {showCreatedDate ? <fieldset className="resource-filter-dates"><legend>By created at</legend>
              <label className="resource-filter-field"><span>From (local time)</span><input aria-label="Created from" type="datetime-local" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} /></label>
              <label className="resource-filter-field"><span>Until (local time, exclusive)</span><input aria-label="Created until" type="datetime-local" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} /></label>
            </fieldset> : null}
            {createdFrom && createdTo && createdFrom >= createdTo ? <p className="form-error" role="alert">Start time must be before end time.</p> : null}
            {optionsError ? <p className="form-error" role="alert">{optionsError}</p> : null}
          </div>
          <footer className="resource-filter-footer">
            <button className="button button--secondary" onClick={() => { setDraftFilters({}); setCreatedFrom(""); setCreatedTo(""); }} type="button">Reset</button>
            <button className="button button--primary" disabled={Boolean(createdFrom && createdTo && createdFrom >= createdTo)} type="submit">Apply filters</button>
          </footer>
        </form>
      </aside>
    </div>, document.body) : null}
  </>;
}
