export type ResourceKey =
  | "checkout_sessions"
  | "checkout_invites"
  | "webhook_events"
  | "affiliate_commissions"
  | "affiliate_withdrawals"
  | "generation_attempts"
  | "generation_outbox"
  | "products"
  | "product_routes"
  | "plans"
  | "entitlements"
  | "plan_limits"
  | "users"
  | "api_keys"
  | "security_blocklist"
  | "meta_deletion_requests"
  | "newsletter_subscribers"
  | "affiliates"
  | "generations"
  | "priority_support_requests";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };
export type ResourceRecord = JsonObject;

export type FieldKind =
  | "relation"
  | "relations"
  | "text"
  | "email"
  | "password"
  | "number"
  | "boolean"
  | "select"
  | "textarea"
  | "json"
  | "datetime";

export interface SelectOption {
  label: string;
  value: string;
}

export interface ResourceField {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  nullable?: boolean;
  createOnly?: boolean;
  editOnly?: boolean;
  immutableOnEdit?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  minLength?: number;
  maxLength?: number;
  /** Confirm another field without including this value in the request. */
  confirms?: string;
  step?: number;
  jsonObject?: boolean;
  defaultValue?: JsonPrimitive | JsonObject | JsonValue[];
  referenceResource?: ResourceKey;
  referenceValue?: "id" | "code";
  options?: SelectOption[];
}

export type ColumnKind =
  | "text"
  | "identifier"
  | "number"
  | "boolean"
  | "status"
  | "date"
  | "json"
  | "link";

export interface ResourceColumn {
  /** Physical row field used as this column's stable key and sort field. */
  name: string;
  label: string;
  kind?: ColumnKind;
  sortable?: boolean;
  nullLabel?: string;
  linkPrefix?: string;
  /**
   * Optional read-only presentation override. Paths may traverse embedded API
   * objects, for example `user.name`. The physical field remains available to
   * forms, mutations, filters, and fallback display.
   */
  display?: {
    primaryPath: string;
    fallbackPaths?: string[];
    secondaryPath?: string;
  };
}

export interface ResourceFilter {
  name: string;
  label: string;
  options?: SelectOption[];
}

export type HttpMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface ResourceMutationConfig {
  basePath: string;
  createMethod?: HttpMethod;
  updateMethod?: HttpMethod;
  deleteMethod?: HttpMethod;
}

export interface ResourceConfig {
  key: ResourceKey;
  label: string;
  labelSingular: string;
  description: string;
  primaryKey: string;
  defaultOrder: string;
  defaultDescending: boolean;
  /** Django-style list_display: reorder, add, or remove descriptors here. */
  listDisplay: ResourceColumn[];
  /** Optional Django-style detail field order; unspecified record fields follow it. */
  detailDisplay?: string[];
  /** Django-style editable field list used by create and change forms. */
  fields: ResourceField[];
  searchFields: SelectOption[];
  filters: ResourceFilter[];
  mutations: ResourceMutationConfig;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canBulkDelete: boolean;
  secretResponseFields?: string[];
}

export interface ResourceQuery {
  page: number;
  pageSize: number;
  orderBy: string;
  descending: boolean;
  search?: string;
  searchField?: string;
  filterBy?: string;
  filterValue?: string;
  plan?: string;
  product?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface ResourceListResponse {
  table: ResourceKey;
  rows: ResourceRecord[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    has_more: boolean;
  };
}

export interface ResourceRecordResponse {
  table: ResourceKey;
  row: ResourceRecord;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}
