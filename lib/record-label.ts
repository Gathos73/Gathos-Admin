import type { ResourceRecord } from "./types";

export function recordLabel(record: ResourceRecord, primaryKey: string): string {
  for (const key of ["product_name", "email", "name", "display_name", "code", "route_code", "tier", "key_hint", "confirmation_code", "value", "job_id"]) {
    if (record[key]) return String(record[key]);
  }
  return String(record[primaryKey] ?? "Record");
}
