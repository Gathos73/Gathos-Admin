import type { ComponentType } from "react";
import Link from "next/link";

import {
  AffiliateIcon,
  ArrowUpRightIcon,
  DeletionIcon,
  KeyIcon,
  MailIcon,
  ShieldIcon,
  SparklesIcon,
  TierIcon,
  UsersIcon,
  type IconProps,
} from "@/components/icons";
import { getBackendUrl, getForwardedCookieHeader } from "@/lib/server-auth";

type Resource = {
  description: string;
  href: string;
  icon: ComponentType<IconProps>;
  label: string;
  table: string;
};

type CountResponse = {
  pagination?: {
    total?: number;
  };
};

const RESOURCES: Resource[] = [
  {
    description: "Customer profiles, plans and account status",
    href: "/users",
    icon: UsersIcon,
    label: "Users",
    table: "users",
  },
  {
    description: "Issued credentials, scopes and activity",
    href: "/api-keys",
    icon: KeyIcon,
    label: "API keys",
    table: "api_keys",
  },
  {
    description: "Default quotas and concurrency limits",
    href: "/tier-defaults",
    icon: TierIcon,
    label: "Tier defaults",
    table: "tier_defaults",
  },
  {
    description: "Blocked networks and email domains",
    href: "/security-blocklist",
    icon: ShieldIcon,
    label: "Security blocklist",
    table: "security_blocklist",
  },
  {
    description: "Meta privacy deletion lifecycle",
    href: "/meta-deletion-requests",
    icon: DeletionIcon,
    label: "Meta deletion requests",
    table: "meta_deletion_requests",
  },
  {
    description: "Newsletter audience and acquisition source",
    href: "/newsletter-subscribers",
    icon: MailIcon,
    label: "Newsletter subscribers",
    table: "newsletter_subscribers",
  },
  {
    description: "Referral partners and earned balance",
    href: "/affiliates",
    icon: AffiliateIcon,
    label: "Affiliates",
    table: "affiliates",
  },
  {
    description: "AI requests, jobs and generated output",
    href: "/generations",
    icon: SparklesIcon,
    label: "Generations",
    table: "generations",
  },
];

async function loadCount(table: string, cookieHeader: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${getBackendUrl()}/api/admin/data/${encodeURIComponent(table)}?page=1&page_size=1`,
      {
        cache: "no-store",
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as CountResponse;
    const total = payload.pagination?.total;
    return typeof total === "number" && Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

export async function DashboardOverview() {
  const cookieHeader = await getForwardedCookieHeader();
  const counts = await Promise.all(
    RESOURCES.map((resource) => loadCount(resource.table, cookieHeader)),
  );
  const availableCount = counts.filter((count) => count !== null).length;

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow-badge">Gathos control center</span>
          <h1>Site administration</h1>
          <p>
            Manage platform records, review operational data, and control account access from one
            protected workspace.
          </p>
        </div>
        <div className="dashboard-health" aria-label="Admin API status">
          <span className={`health-dot ${availableCount < RESOURCES.length ? "is-warning" : ""}`} />
          <span>
            <strong>
              {availableCount === RESOURCES.length
                ? "All models connected"
                : `${availableCount} of ${RESOURCES.length} models connected`}
            </strong>
            <small>Live data from the protected admin API</small>
          </span>
        </div>
      </section>

      <section aria-labelledby="models-heading" className="dashboard-section">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Data management</p>
            <h2 id="models-heading">Models</h2>
          </div>
          <span className="model-count">{RESOURCES.length} managed models</span>
        </div>

        <div className="resource-card-grid">
          {RESOURCES.map((resource, index) => {
            const Icon = resource.icon;
            const count = counts[index];
            return (
              <Link className="resource-card" href={resource.href} key={resource.table}>
                <div className="resource-card-topline">
                  <span className="resource-card-icon">
                    <Icon />
                  </span>
                  <span className="resource-card-arrow">
                    <ArrowUpRightIcon />
                  </span>
                </div>
                <div className="resource-card-copy">
                  <span className={`resource-count ${count === null ? "is-unavailable" : ""}`}>
                    {count === null ? "—" : count.toLocaleString("en-US")}
                  </span>
                  <h3>{resource.label}</h3>
                  <p>{resource.description}</p>
                </div>
                <div className="resource-card-footer">
                  <span>{count === null ? "Temporarily unavailable" : "View and manage records"}</span>
                  <span className={`status-pill ${count === null ? "is-warning" : ""}`}>
                    {count === null ? "Offline" : "Live"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
