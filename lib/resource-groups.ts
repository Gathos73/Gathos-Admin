/** Shared grouping for navigation and the dashboard resource cards. */
export const RESOURCE_GROUPS = [
  { id: "products", label: "Resources", hrefs: ["/plans", "/subscriptions", "/products", "/generations"] },
  // { id: "plans", label: "Plans & limits", hrefs: ["/plans", ] },
  { id: "accounts", label: "Accounts & access", hrefs: ["/users", "/api-keys", "/priority-support"] },
  { id: "security", label: "Security & privacy", hrefs: ["/security-blocklist", "/meta-deletion-requests"] },
  { id: "growth", label: "Marketing & Affiliates", hrefs: ["/newsletter-subscribers", "/affiliates", "/affiliate-commissions", "/affiliate-withdrawals"] },
  { id: "debugging", label: "Debugging", hrefs: ["/checkout-sessions", "/checkout-invites", "/webhook-events", "/generation-attempts", "/generation-outbox"] },
];
