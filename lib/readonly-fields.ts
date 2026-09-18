import type { ResourceConfig, ResourceField, ResourceRecord } from "./types";

// Rendered by dedicated inline sections (limits, routes) or used only for labels.
const INLINE_KEYS = new Set(["plan_limits", "plan_products", "product_routes"]);

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Field list for the read-only (view) form: the configured edit fields first,
 * then any remaining database-managed values, so the view screen mirrors the
 * edit form while still showing metadata and resources without editable fields.
 */
export function readOnlyFields(config: ResourceConfig, record: ResourceRecord): ResourceField[] {
  const fields = config.fields.filter(
    (field) => !field.createOnly && field.kind !== "password" && !field.confirms,
  );
  const known = new Set(fields.map((field) => field.name));
  // Names shown as a relation's label (plan -> plan_name) are not separate rows.
  for (const field of fields) {
    if (field.kind !== "relation") continue;
    const base = field.name.replace(/_id$/, "");
    known.add(`${base}_name`);
    known.add(`${base}_code`);
  }
  const labels = new Map(config.listDisplay.map((column) => [column.name, column.label] as const));
  const preferred = config.detailDisplay ?? [
    config.primaryKey,
    ...config.listDisplay.map((column) => column.name),
  ];

  const extras: ResourceField[] = [];
  for (const name of new Set([...preferred, ...Object.keys(record)])) {
    if (known.has(name) || INLINE_KEYS.has(name) || record[name] === undefined) continue;
    const value = record[name];
    extras.push({
      name,
      label: labels.get(name) ?? humanize(name),
      kind: typeof value === "boolean" ? "boolean" : value !== null && typeof value === "object" ? "json" : "text",
    });
  }
  return [...fields, ...extras];
}
