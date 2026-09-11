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
  for (const key of ["product_name", "email", "name", "display_name", "code", "route_code", "tier", "key_hint", "confirmation_code", "value", "job_id"]) {
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
      {keys.map((key) => {
        let valueElement = detailValue(record[key]);
        if (key === "product_id" && record.product_name) {
          valueElement = (
            <span className="detail-text">
              {String(record.product_name)}
              {record.product_code ? <span style={{ opacity: 0.7 }}> ({String(record.product_code)})</span> : null}
            </span>
          );
        } else if (key === "plan_id" && record.plan_name) {
          valueElement = <span className="detail-text">{String(record.plan_name)}</span>;
        }
        return (
          <div className="detail-row" key={key}>
            <dt>{labels.get(key) ?? humanize(key)}</dt>
            <dd>{valueElement}</dd>
          </div>
        );
      })}
    </dl>
  );
}
