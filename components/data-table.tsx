"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";

import type { JsonValue, ResourceColumn, ResourceRecord } from "../lib/types";
import { DeleteIcon, EditIcon, MoreIcon } from "./icons";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function valueAtPath(record: ResourceRecord, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = record;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function hasDisplayValue(value: JsonValue | undefined): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function resolveColumnValue(row: ResourceRecord, column: ResourceColumn) {
  if (!column.display) {
    return { primary: row[column.name], secondary: undefined };
  }

  const candidates = [column.display.primaryPath, ...(column.display.fallbackPaths ?? [])];
  const primary = candidates
    .map((path) => valueAtPath(row, path))
    .find(hasDisplayValue);
  const secondary = column.display.secondaryPath
    ? valueAtPath(row, column.display.secondaryPath)
    : undefined;

  return {
    primary,
    secondary:
      hasDisplayValue(secondary) && String(secondary) !== String(primary)
        ? secondary
        : undefined,
  };
}

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}

function SelectAllCheckbox({ checked, indeterminate, onChange }: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      aria-label="Select all rows on this page"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  );
}

function formatValue(value: JsonValue | undefined, column: ResourceColumn) {
  if (value === undefined || value === null || value === "") {
    return <span className="empty-value">{value === null ? column.nullLabel ?? "—" : "—"}</span>;
  }

  switch (column.kind) {
    case "boolean":
      return (
        <span className={`boolean-badge boolean-badge--${value ? "true" : "false"}`}>
          {value ? "Yes" : "No"}
        </span>
      );
    case "status": {
      const text = String(value);
      const modifier = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return <span className={`status-badge status-badge--${modifier}`}>{text.replaceAll("_", " ")}</span>;
    }
    case "date": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : DATE_FORMATTER.format(date);
    }
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    case "json":
      return <code className="json-cell">{JSON.stringify(value)}</code>;
    case "identifier":
      return <code className="identifier-cell">{String(value)}</code>;
    case "link": {
      const text = String(value);
      const href = (column.linkPrefix || "") + text;
      return (
        <Link
          className="table-link"
          href={href}
          onClick={(event) => event.stopPropagation()}
          style={{ color: "var(--accent, #a78bfa)", textDecoration: "none" }}
        >
          <code className="identifier-cell">{text.length > 12 ? `${text.slice(0, 8)}…` : text}</code>
        </Link>
      );
    }
    default:
      return <span className="text-cell">{String(value)}</span>;
  }
}

function formatCell(row: ResourceRecord, column: ResourceColumn) {
  const { primary, secondary } = resolveColumnValue(row, column);
  if (!column.display || !hasDisplayValue(primary)) return formatValue(primary, column);

  return (
    <span className="related-cell" title={String(row[column.name] ?? "")}>
      <span className="related-cell__primary">{String(primary)}</span>
      {hasDisplayValue(secondary) ? (
        <span className="related-cell__secondary">{String(secondary)}</span>
      ) : null}
    </span>
  );
}

interface DataTableProps {
  rows: ResourceRecord[];
  columns: ResourceColumn[];
  primaryKey: string;
  loading: boolean;
  orderBy: string;
  descending: boolean;
  selectionEnabled: boolean;
  selectedIds: string[];
  canEdit: boolean;
  canDelete: boolean;
  onSelectionChange: (ids: string[]) => void;
  onSort: (column: string) => void;
  onView: (row: ResourceRecord) => void;
  onViewIntent: (row: ResourceRecord) => void;
  viewHref: (row: ResourceRecord) => string;
  onEdit: (row: ResourceRecord) => void;
  onEditIntent: (row: ResourceRecord) => void;
  editHref: (row: ResourceRecord) => string;
  onDelete: (row: ResourceRecord) => void;
}

export function DataTable({
  rows,
  columns,
  primaryKey,
  loading,
  orderBy,
  descending,
  selectionEnabled,
  selectedIds,
  canEdit,
  canDelete,
  onSelectionChange,
  onSort,
  onView,
  onViewIntent,
  viewHref,
  onEdit,
  onEditIntent,
  editHref,
  onDelete,
}: DataTableProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(
    () => rows.map((row) => String(row[primaryKey] ?? "")).filter(Boolean),
    [primaryKey, rows],
  );
  const selectedVisibleCount = visibleIds.reduce(
    (count, id) => count + (selected.has(id) ? 1 : 0),
    0,
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleRow = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectionChange([...next]);
  };

  const togglePage = (checked: boolean) => {
    const next = new Set(selected);
    for (const id of visibleIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onSelectionChange([...next]);
  };

  return (
    <div aria-busy={loading} className="data-table-shell">
      <div aria-label="Records table" className="data-table-scroll" role="region" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              {selectionEnabled ? (
                <th className="selection-column" scope="col">
                  <SelectAllCheckbox
                    checked={allVisibleSelected}
                    indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                    onChange={togglePage}
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const active = orderBy === column.name;
                return (
                  <th
                    aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
                    key={column.name}
                    scope="col"
                  >
                    {column.sortable ? (
                      <button
                        className={`sort-button${active ? " sort-button--active" : ""}`}
                        onClick={() => onSort(column.name)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        <span aria-hidden="true" className="sort-indicator">
                          {active ? (descending ? "↓" : "↑") : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              <th className="actions-column" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, index) => (
                  <tr className="skeleton-row" key={index}>
                    {selectionEnabled ? <td className="selection-column" /> : null}
                    {columns.map((column) => (
                      <td key={column.name}>
                        <span className="skeleton-block" />
                      </td>
                    ))}
                    <td className="actions-column">
                      <span className="skeleton-block" />
                    </td>
                  </tr>
                ))
              : rows.map((row) => {
                  const id = String(row[primaryKey] ?? "");
                  return (
                    <tr className={selected.has(id) ? "data-row data-row--selected" : "data-row"} key={id}>
                      {selectionEnabled ? (
                        <td className="selection-column">
                          <input
                            aria-label={`Select record ${id}`}
                            checked={selected.has(id)}
                            onChange={(event) => toggleRow(id, event.target.checked)}
                            type="checkbox"
                          />
                        </td>
                      ) : null}
                      {columns.map((column) => (
                        <td data-label={column.label} key={column.name}>
                          {formatCell(row, column)}
                        </td>
                      ))}
                      <td className="actions-column">
                        <div className="row-actions">
                          <button
                            aria-label={`View ${id}`}
                            className="icon-button"
                            data-navigation-href={viewHref(row)}
                            data-navigation-label="View record"
                            onClick={() => onView(row)}
                            onFocus={() => onViewIntent(row)}
                            onPointerEnter={() => onViewIntent(row)}
                            title="View"
                            type="button"
                          >
                            <MoreIcon size={17} />
                          </button>
                          {canEdit ? (
                            <button
                              aria-label={`Edit ${id}`}
                              className="icon-button"
                              data-navigation-href={editHref(row)}
                              data-navigation-label="Edit record"
                              onClick={() => onEdit(row)}
                              onFocus={() => onEditIntent(row)}
                              onPointerEnter={() => onEditIntent(row)}
                              title="Edit"
                              type="button"
                            >
                              <EditIcon size={16} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              aria-label={`Delete ${id}`}
                              className="icon-button icon-button--danger"
                              onClick={() => onDelete(row)}
                              title="Delete"
                              type="button"
                            >
                              <DeleteIcon size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <div className="empty-state">
          <strong>No matching records</strong>
          <span>Try clearing the search or filter.</span>
        </div>
      ) : null}
    </div>
  );
}
