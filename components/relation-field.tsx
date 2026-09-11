"use client";

import { useEffect, useState } from "react";
import { listResource } from "@/lib/api";
import { cacheProducts } from "@/lib/catalog-inline-drafts";
import type { ResourceField, SelectOption } from "@/lib/types";
import { TransferList, type TransferItem } from "./transfer-list";

export function RelationField({
  disabled,
  field,
  onChange,
  value,
}: {
  disabled: boolean;
  field: ResourceField;
  onChange: (value: string) => void;
  value: string;
}) {
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!field.referenceResource) return;
      const result: SelectOption[] = [];
      const items: TransferItem[] = [];
      for (let page = 1; ; page += 1) {
        const response = await listResource(
          field.referenceResource,
          { page, pageSize: 200, orderBy: "code", descending: false },
          controller.signal,
        );
        if (field.referenceResource === "products") {
          cacheProducts(response.rows);
        }
        for (const row of response.rows) {
          const id = String(row[field.referenceValue || "id"]);
          const name = String(row.name || row.display_name || row.code || "Untitled");
          const code = row.code ? String(row.code) : undefined;
          const retired = Boolean(row.retired_at);
          items.push({ id, name, code, retired });
        }
        result.push(
          ...response.rows
            .filter((row) => field.referenceValue !== "code" || !row.retired_at)
            .map((row) => ({
              value: String(row[field.referenceValue || "id"]),
              label: `${row.name || row.display_name || row.code} (${row.code})${row.retired_at ? " · retired" : ""}`,
            })),
        );
        if (!response.pagination.has_more) break;
      }
      if (!controller.signal.aborted) {
        setOptions(result);
        setTransferItems(items);
        setLoading(false);
      }
    }

    void load().catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to load choices.");
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [field.referenceResource, field.referenceValue]);

  const multiple = field.kind === "relations";

  if (multiple) {
    let selectedIds: string[] = [];
    try {
      const parsed = JSON.parse(value || "[]");
      if (Array.isArray(parsed)) {
        selectedIds = parsed.map(String);
      }
    } catch {
      selectedIds = [];
    }

    return (
      <>
        <TransferList
          disabled={disabled || Boolean(error)}
          items={transferItems}
          leftTitle="Available Products"
          loading={loading}
          onChange={(nextIds) => onChange(JSON.stringify(nextIds))}
          rightTitle="Plan Products"
          value={selectedIds}
        />
        {error ? (
          <span className="form-error" role="alert">
            {error}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <select
        aria-label={field.label}
        disabled={disabled || loading || Boolean(error)}
        name={field.name}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        value={value}
      >
        <option value="">{loading ? "Loading…" : "Select…"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
