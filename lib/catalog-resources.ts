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
    fields: [{ ...code, placeholder: "e.g. creator_custom", help: "Unique plan identifier using lowercase letters, numbers and underscores. Cannot be changed after creation." },
      { name: "display_name", placeholder: "e.g. Creator Custom", label: "Display name", kind: "text", required: true, help: "Plan name shown to users on their Subscription page and in invitation emails." },
      { name: "description", placeholder: "e.g. Image and video generation with increased limits.", label: "Description", kind: "textarea", nullable: true, help: "Describe what this plan includes. This text is included in plan invitation emails." },
      { ...productSelection, help: "Products users on this plan can access in the playground and API, subject to the plan and product limits." },
      { name: "price_minor", placeholder: "e.g. 1800", label: "Price in minor currency units", kind: "number", min: 0, defaultValue: 0, help: "For USD, enter cents: 1800 means $18. Used when creating a Dodo product; editing this value does not change Dodo charges." },
      { name: "currency", placeholder: "e.g. USD", label: "Currency", kind: "text", defaultValue: "USD", required: true, help: "Three-letter currency code, such as USD or INR. Must match the linked Dodo product for payment invitations." },
      { name: "billing_interval", label: "Billing interval", kind: "select", required: true, options: ["none", "month", "year"].map(option), defaultValue: "none", help: "None means a one-time payment for paid plans. Editing billing fields does not update Dodo." },
      { name: "is_public", label: "Public plan", kind: "boolean", defaultValue: true, help: "Makes the plan available in the public plan selection. Turn off for a custom plan intended for an individual user." },
      { name: "priority_support", label: "Priority support", kind: "boolean", defaultValue: false, help: "Enables priority support ticket submission for users on this plan." },
      { name: "display_price_label", placeholder: "e.g. $18", label: "Custom price label", kind: "text", nullable: true, help: "Optional price text on the Subscription page, such as \"$18\" or \"Custom pricing\". Leave blank to show the formatted price and currency. Does not change Dodo charges." },
      { name: "billing_label", placeholder: "e.g. per month", label: "Billing label", kind: "text", nullable: true, help: "Optional text after the displayed price, such as \"per month\" or \"under custom agreement\". Leave blank to use the billing interval. Does not change the billing schedule." },
      { name: "billing_provider", placeholder: "e.g. dodo", label: "Billing provider", kind: "text", nullable: true, help: "Enter dodo when linking an existing Dodo product. Set automatically if you confirm Dodo product creation when saving a new plan." },
      { name: "provider_price_id", placeholder: "e.g. pdt_abc123", label: "Provider price ID", kind: "text", nullable: true, help: "The linked Dodo product ID, not a customer or subscription ID. Set automatically when Dodo product creation succeeds, or enter an existing product ID. Editing this does not change existing Dodo subscriptions." },
      // Plan-wide limits
      { name: "plan_fixed_window_limit", label: "Plan fixed-window limit", kind: "number", placeholder: "e.g. 1000 (blank: unlimited)", nullable: true, min: 1, help: "Maximum accepted generations per user across all products in each shared 4-hour UTC window. Product limits also apply. Leave blank for no plan-wide window limit." },
      { name: "plan_queue_depth_limit", label: "Plan queue depth limit", kind: "number", placeholder: "e.g. 20 (blank: unlimited)", nullable: true, min: 1, help: "Max generations queued (not yet accepted) across all products. Leave blank for unlimited." },
      { name: "plan_concurrency_limit", label: "Plan concurrency limit", kind: "number", placeholder: "e.g. 5 (blank: unlimited)", nullable: true, min: 1, help: "Max concurrent active accepted generations across all products. Leave blank for unlimited." }],
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
