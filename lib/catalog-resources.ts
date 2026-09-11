import type { ResourceConfig, ResourceField, SelectOption } from "./types";

const option = (value: string): SelectOption => ({ label: value.replaceAll("_", " "), value });
const code: ResourceField = { name: "code", label: "Code", kind: "text", required: true, immutableOnEdit: true, help: "Stable lowercase code, using letters, numbers and underscores." };
const productSelection: ResourceField = { name: "product_ids", label: "Products", kind: "relations", referenceResource: "products", defaultValue: [], help: "Select the products included in this group." };
const base = { primaryKey: "id", defaultOrder: "created_at", defaultDescending: true, canCreate: true, canEdit: true, canDelete: true, canBulkDelete: false };

export const CATALOG_CONFIGS: Record<"products" | "plans" | "plan_limits" | "product_routes", ResourceConfig> = {
  products: {
    ...base, key: "products", label: "Products", labelSingular: "product",
    description: "Generation capabilities and their input/output contracts. Used contracts are protected; deleting retires a product.",
    listDisplay: [{ name: "code", label: "Code", sortable: true }, { name: "name", label: "Name", sortable: true }, { name: "contract_version", label: "Version", kind: "number" }, { name: "retired_at", label: "Retired", kind: "date" }],
    fields: [code, { name: "name", label: "Name", kind: "text", required: true }, { name: "description", label: "Description", kind: "textarea", nullable: true },
      { name: "input_schema", label: "Input JSON Schema", kind: "json", jsonObject: true, defaultValue: {} },
      { name: "output_schema", label: "Output JSON Schema", kind: "json", jsonObject: true, defaultValue: {} },
      { name: "default_max_attempts", label: "Maximum attempts", kind: "number", min: 1, defaultValue: 3 },
      { name: "allows_user_retry", label: "Allow user retries", kind: "boolean", defaultValue: true }],
    searchFields: [{ label: "Code", value: "code" }, { label: "Name", value: "name" }], filters: [], mutations: { basePath: "/catalog/products" },
  },
  product_routes: {
    ...base, key: "product_routes", label: "Product routes", labelSingular: "product route",
    description: "Provider routing for products. Routes already used by generation attempts are protected from changes.",
    listDisplay: [{ name: "route_code", label: "Route", sortable: true }, { name: "product_name", label: "Product" }, { name: "provider_code", label: "Provider", sortable: true }, { name: "priority", label: "Priority", kind: "number", sortable: true }],
    fields: [{ name: "product_id", label: "Product", kind: "relation", referenceResource: "products", required: true },
    { name: "route_code", label: "Route code", kind: "text", required: true },
    { name: "provider_code", label: "Provider code", kind: "text", required: true },
    { name: "provider_product_code", label: "Provider model/product", kind: "text", nullable: true },
    { name: "execution_pool", label: "Execution pool", kind: "text", nullable: true },
    { name: "priority", label: "Priority", kind: "number", min: 0, defaultValue: 100 },
    { name: "credential_secret_name", label: "Credential reference", kind: "text", nullable: true, help: "Environment or secret-manager key name. Never paste the credential itself." },
    { name: "executor_config", label: "Executor configuration", kind: "json", jsonObject: true, defaultValue: {} }],
    searchFields: [{ label: "Route", value: "route_code" }, { label: "Provider", value: "provider_code" }], filters: [], mutations: { basePath: "/catalog/product_routes" },
  },
  plans: {
    ...base, key: "plans", label: "Plans", labelSingular: "plan",
    description: "Shared plan access and pricing. Changes apply directly to everyone assigned to the plan. Create a private plan for individual exceptions. Deleting retires the plan.",
    listDisplay: [{ name: "code", label: "Code", sortable: true }, { name: "display_name", label: "Name", sortable: true }, { name: "price_minor", label: "Price (minor units)", kind: "number", sortable: true }, { name: "currency", label: "Currency" }, { name: "is_public", label: "Public", kind: "boolean", sortable: true }, { name: "priority_support", label: "Priority support", kind: "boolean", sortable: true }, { name: "retired_at", label: "Retired", kind: "date" }],
    fields: [code, { name: "display_name", label: "Display name", kind: "text", required: true },
      { name: "description", label: "Description", kind: "textarea", nullable: true }, productSelection,
      { name: "price_minor", label: "Price in minor currency units", kind: "number", min: 0, defaultValue: 0 },
      { name: "currency", label: "Currency", kind: "text", defaultValue: "USD", required: true },
      { name: "billing_interval", label: "Billing interval", kind: "select", required: true, options: ["none", "month", "year"].map(option), defaultValue: "none", help: "None means a one-time payment for paid plans. Editing billing fields does not update Dodo." },
      { name: "is_public", label: "Public plan", kind: "boolean", defaultValue: true },
      { name: "priority_support", label: "Priority support", kind: "boolean", defaultValue: false, help: "Enables priority support ticket submission for users on this plan." },
      { name: "display_price_label", label: "Custom price label", kind: "text", nullable: true },
      { name: "billing_label", label: "Billing label", kind: "text", nullable: true },
      { name: "billing_provider", label: "Billing provider", kind: "text", nullable: true },
      { name: "provider_price_id", label: "Provider price ID", kind: "text", nullable: true },
      // Plan-wide limits
      { name: "plan_fixed_window_limit", label: "Plan fixed-window limit", kind: "number", placeholder: "Unlimited", nullable: true, min: 1, help: "Max accepted generations across all products within the window. Leave blank for unlimited." },
      { name: "plan_queue_depth_limit", label: "Plan queue depth limit", kind: "number", placeholder: "Unlimited", nullable: true, min: 1, help: "Max generations queued (not yet accepted) across all products. Leave blank for unlimited." },
      { name: "plan_concurrency_limit", label: "Plan concurrency limit", kind: "number", placeholder: "Unlimited", nullable: true, min: 1, help: "Max concurrent active accepted generations across all products. Leave blank for unlimited." }],
    searchFields: [{ label: "Code", value: "code" }, { label: "Name", value: "display_name" }], filters: [{ name: "is_public", label: "Public", options: [{ label: "Public", value: "true" }, { label: "Private", value: "false" }] }], mutations: { basePath: "/catalog/plans" },
  },
  plan_limits: {
    ...base, key: "plan_limits", label: "Plan limits", labelSingular: "plan limit", canCreate: false,
    description: "Per-product generation allowances. Each product in a plan can have a fixed-window, queue-depth, and concurrency limit. Zero denies all; blank means unlimited.",
    listDisplay: [{ name: "product_name", label: "Product" }, { name: "plan_name", label: "Plan" }, { name: "fixed_window_limit", label: "Fixed window", kind: "number" }, { name: "queue_depth_limit", label: "Queue depth", kind: "number" }, { name: "concurrency_limit", label: "Concurrency", kind: "number" }],
    fields: [
      { name: "plan_id", label: "Plan", kind: "relation", referenceResource: "plans", required: true, immutableOnEdit: true },
      { name: "product_id", label: "Product", kind: "relation", referenceResource: "products", required: true, immutableOnEdit: true, help: "Must be one of the plan's granted products." },
      { name: "fixed_window_limit", label: "Fixed-window limit", kind: "number", nullable: true, min: 0, help: "Max accepted generations within the shared UTC quota window. Leave blank for unlimited." },
      { name: "queue_depth_limit", label: "Queue depth limit", kind: "number", nullable: true, min: 0, help: "Max queued (not yet accepted) generations for this product. Leave blank for unlimited." },
      { name: "concurrency_limit", label: "Concurrency limit", kind: "number", nullable: true, min: 1, help: "Max accepted active generations running at the same time for this product. Leave blank for unlimited." },
    ],

    searchFields: [{ label: "Product", value: "product_name" }], filters: [{ name: "plan_id", label: "Plan ID" }], mutations: { basePath: "/catalog/plan_limits" },
  },
};
