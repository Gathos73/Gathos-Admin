import type { ResourceConfig } from "./types";

export const SUBSCRIPTION_CONFIG: ResourceConfig = {
  key: "entitlements",
  label: "Subscriptions",
  labelSingular: "subscription",
  description: "User subscriptions and access history from entitlements, including billing periods and renewal dates.",
  primaryKey: "id",
  defaultOrder: "created_at",
  defaultDescending: true,
  listDisplay: [
    {
      name: "user_id", label: "User",
      display: { primaryPath: "user.email", secondaryPath: "user.name", fallbackPaths: ["user_id"] },
    },
    { name: "plan_name", label: "Plan", sortable: true },
    { name: "status", label: "Status", kind: "status", sortable: true },
    { name: "source", label: "Source", kind: "status", sortable: true },
    { name: "billing_provider", label: "Billing provider", sortable: true },
    { name: "provider_subscription_id", label: "Subscription ID", kind: "identifier", sortable: true },
    { name: "current_period_starts_at", label: "Period starts", kind: "date", sortable: true },
    { name: "current_period_ends_at", label: "Renewal / period end", kind: "date", sortable: true },
    { name: "ends_at", label: "Access ends", kind: "date", sortable: true },
    { name: "created_at", label: "Created", kind: "date", sortable: true },
  ],
  detailDisplay: [
    "id", "user", "plan_name", "plan_code", "plan_version", "status", "source",
    "billing_provider", "provider_subscription_id", "provider_customer_id", "provider_status",
    "starts_at", "current_period_starts_at", "current_period_ends_at", "ends_at",
    "cancelled_at", "superseded_at", "created_at", "updated_at",
  ],
  fields: [],
  searchFields: [
    { label: "User email", value: "user_email" },
    { label: "User name", value: "user_name" },
    { label: "Subscription ID", value: "provider_subscription_id" },
    { label: "Plan", value: "plan_name" },
  ],
  filters: [
    {
      name: "status", label: "Status", options: [
        { label: "Active", value: "active" },
        { label: "On hold", value: "on_hold" },
        { label: "Pending", value: "pending" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Expired", value: "expired" },
        { label: "Superseded", value: "superseded" },
        { label: "Revoked", value: "revoked" },
      ],
    },
    {
      name: "source", label: "Source", options: [
        { label: "Paid", value: "paid" },
        { label: "Business", value: "business" },
        { label: "Complimentary", value: "complimentary" },
        { label: "Trial", value: "trial" },
        { label: "Free", value: "free" },
      ],
    },
    { name: "user_id", label: "User ID" },
    { name: "plan_code", label: "Plan code" },
    { name: "billing_provider", label: "Billing provider" },
  ],
  mutations: { basePath: "/resources/entitlements" },
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canBulkDelete: false,
};
