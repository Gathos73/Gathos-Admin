import Link from "next/link";
import type { ResourceRecord } from "../lib/types";

/** Owner details for a record, read from the `user` object the detail API already returns. */
export function RecordUserInline({ record }: { record: ResourceRecord }) {
  const user = record.user && typeof record.user === "object" && !Array.isArray(record.user)
    ? (record.user as { id?: unknown; email?: unknown; name?: unknown })
    : null;
  const id = String(user?.id ?? record.user_id ?? "");
  if (!id) return null;
  const rows: Array<[string, string]> = [
    ["Name", user?.name ? String(user.name) : "—"],
    ["Email", user?.email ? String(user.email) : "—"],
    ["User ID", id],
  ];

  return (
    <section className="record-user-inline record-page-panel">
      <header className="record-page-panel-header">
        <div>
          <h2>User</h2>
          <p>The account that owns this record.</p>
        </div>
        <Link className="button button--secondary button--small" href={`/users/${encodeURIComponent(id)}`}>
          View user
        </Link>
      </header>
      <dl className="record-user-inline-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{label === "User ID" ? <code>{value}</code> : value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
