import type { JsonValue, ResourceConfig, ResourceRecord } from "../lib/types";

function detailValue(value: JsonValue | undefined) {
  if (value === undefined || value === null || value === "") {
    return <span className="empty-value">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={`boolean-badge boolean-badge--${value ? "true" : "false"}`}>
        {value ? "Yes" : "No"}
      </span>
    );
  }
  if (typeof value === "object") {
    return <pre className="detail-json">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span className="detail-text">{String(value)}</span>;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function recordLabel(record: ResourceRecord, primaryKey: string): string {
  for (const key of ["email", "name", "tier", "key_hint", "confirmation_code", "value", "job_id"]) {
    if (record[key]) return String(record[key]);
  }
  return String(record[primaryKey] ?? "Record");
}

export function RecordDetail({
  config,
  record,
}: {
  config: ResourceConfig;
  record: ResourceRecord;
}) {
  const preferredFields = config.detailDisplay ?? [
    config.primaryKey,
    ...config.listDisplay.map((column) => column.name),
    ...config.fields.map((field) => field.name),
  ];
  const keys = Array.from(new Set([...preferredFields, ...Object.keys(record)])).filter(
    (field) => record[field] !== undefined,
  );
  const labels = new Map([
    ...config.listDisplay.map((column) => [column.name, column.label] as const),
    ...config.fields.map((field) => [field.name, field.label] as const),
  ]);

  return (
    <dl className="record-detail">
      {keys.map((key) => (
        <div className="detail-row" key={key}>
          <dt>{labels.get(key) ?? humanize(key)}</dt>
          <dd>{detailValue(record[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
