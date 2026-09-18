import type { ResourceRecord } from "../lib/types";

interface ReadOnlyItem {
  id: string;
  name: string;
  code?: string;
}

/** Read-only counterpart of TransferList: shows only the selected items, no options request. */
export function ReadOnlyItemList({
  emptyText = "No products selected",
  items,
  title = "Plan Products",
}: {
  emptyText?: string;
  items: ReadOnlyItem[];
  title?: string;
}) {
  return (
    <div className="transfer-list-card transfer-list-card--static" role="region" aria-label={title}>
      <div className="transfer-list-header">
        <span className="transfer-list-title">{title}</span>
        <span className="transfer-list-badge transfer-list-badge--active">{items.length} selected</span>
      </div>
      <div className="transfer-list-body" role="list">
        {items.length > 0 ? (
          items.map((item) => (
            <div className="transfer-list-item transfer-list-item--static" key={item.id} role="listitem">
              <div className="transfer-item-content">
                <span className="transfer-item-name">{item.name}</span>
                {item.code ? <code className="transfer-item-code">{item.code}</code> : null}
              </div>
            </div>
          ))
        ) : (
          <div className="transfer-list-empty">
            <span className="transfer-list-empty-title">{emptyText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Selected items for a `relations` field, using names already present on the record. */
export function selectedItemsFromRecord(record: ResourceRecord | undefined, value: string): ReadOnlyItem[] {
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(value || "[]");
    if (Array.isArray(parsed)) ids = parsed.map(String);
  } catch {
    ids = [];
  }
  const known = new Map<string, ReadOnlyItem>();
  if (Array.isArray(record?.plan_products)) {
    for (const item of record.plan_products) {
      const row = item as { id?: unknown; name?: unknown; code?: unknown };
      const id = String(row.id);
      known.set(id, { id, name: String(row.name || row.code || id), code: row.code ? String(row.code) : undefined });
    }
  }
  return ids.map((id) => known.get(id) ?? { id, name: id });
}
