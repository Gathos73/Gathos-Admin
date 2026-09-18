"use client";

import { clearRequestCache } from "@/lib/request-cache";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  AffiliateIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DeletionIcon,
  GpuIcon,
  KeyIcon,
  LogoutIcon,
  MailIcon,
  MenuIcon,
  ProductIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  SupportIcon,
  TierIcon,
  UsersIcon,
  type IconProps,
} from "@/components/icons";

import { RESOURCE_GROUPS } from "@/lib/resource-groups";
import { RouteNavigationFeedback } from "@/components/route-navigation-feedback";

type NavItem = {
  description: string;
  href: string;
  hideFromSidebar?: boolean;
  icon: ComponentType<IconProps>;
  keywords: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/checkout-sessions", label: "Checkout sessions", description: "View and edit checkout sessions", icon: TierIcon, keywords: "debugging payment billing checkout_sessions" },
  { href: "/checkout-invites", label: "Checkout invites", description: "View and edit checkout invites", icon: TierIcon, keywords: "debugging payment billing checkout_invites" },
  { href: "/webhook-events", label: "Payment webhooks", description: "View and edit payment webhooks", icon: TierIcon, keywords: "debugging payment billing webhook_events" },
  { href: "/affiliate-commissions", label: "Affiliate commissions", description: "View and edit affiliate commissions", icon: TierIcon, keywords: "debugging payment billing affiliate_commissions" },
  { href: "/affiliate-withdrawals", label: "Affiliate withdrawals", description: "View and edit affiliate withdrawals", icon: TierIcon, keywords: "debugging payment billing affiliate_withdrawals" },
  { href: "/generation-attempts", label: "Job attempts", description: "View and edit job attempts", icon: GpuIcon, keywords: "debugging jobs generation_attempts" },
  { href: "/generation-outbox", label: "Job outbox", description: "View and edit job outbox", icon: GpuIcon, keywords: "debugging jobs generation_outbox" },

  {
    description: "System overview",
    href: "/",
    icon: DashboardIcon,
    keywords: "home overview dashboard",
    label: "Dashboard",
  },
  {
    description: "Registered GPU resource status and collector history",
    href: "/gpu-health",
    icon: GpuIcon,
    keywords: "gpu health collector cpu ram vram temperature network history monitoring",
    label: "GPU health",
  },
  { href: "/gpus", label: "GPUs & Services", description: "Register GPU servers, collectors and ML services", icon: GpuIcon, keywords: "gpu registry compute image video tts music collector endpoint" },
  { href: "/products", label: "Products", description: "Manage products", icon: ProductIcon, keywords: "catalog products" },
  // { href: "/product-routes", label: "Product routes", description: "Manage product routes", icon: TierIcon, keywords: "catalog product_routes", hideFromSidebar: true },
  { href: "/plans", label: "Plans", description: "Manage plans", icon: TierIcon, keywords: "catalog plans" },
  { href: "/subscriptions", label: "Subscriptions", description: "User subscriptions, billing periods, and access history", icon: TierIcon, keywords: "entitlements subscriptions renewal billing dates" },
  // { href: "/plan-limits", label: "Plan limits", description: "Manage plan limits", icon: TierIcon, keywords: "catalog plan_limits" },
  {
    description: "Accounts and access",
    href: "/users",
    icon: UsersIcon,
    keywords: "accounts profile customer",
    label: "Users",
  },
  {
    description: "Credentials and usage",
    href: "/api-keys",
    icon: KeyIcon,
    keywords: "credentials tokens keys",
    label: "API keys",
  },
  {
    description: "Network restrictions",
    href: "/security-blocklist",
    icon: ShieldIcon,
    keywords: "security blocked ip cidr email domain",
    label: "Security blocklist",
  },
  {
    description: "Privacy requests",
    href: "/meta-deletion-requests",
    icon: DeletionIcon,
    keywords: "meta facebook privacy delete removal",
    label: "Meta deletions",
  },
  {
    description: "Mailing audience",
    href: "/newsletter-subscribers",
    icon: MailIcon,
    keywords: "newsletter email mailing subscribers",
    label: "Newsletter",
  },
  {
    description: "Referral partners",
    href: "/affiliates",
    icon: AffiliateIcon,
    keywords: "partners referrals commission",
    label: "Affiliates",
  },
  {
    description: "AI requests and output",
    href: "/generations",
    icon: SparklesIcon,
    keywords: "generation ai image tts video job",
    label: "Generations",
  },
  {
    description: "Enterprise priority support tickets",
    href: "/priority-support",
    icon: SupportIcon,
    keywords: "priority support tickets enterprise grievance",
    label: "Priority support",
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === href : (pathname === href || pathname.startsWith(`${href}/`));
}

export function AdminShell({ children, email }: { children: ReactNode; email?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const currentItem = NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
  const nestedRecordPage = Boolean(
    currentItem && currentItem.href !== "/" && pathname !== currentItem.href,
  );
  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? NAV_ITEMS.filter((item) =>
      `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalizedQuery),
    )
    : [];

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape") {
        setQuery("");
        setMenuOpen(false);
        searchRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  function openMatch(item: NavItem) {
    setQuery("");
    setMenuOpen(false);
    router.prefetch(item.href);
    router.push(item.href);
  }

  async function handleLogout() {
    setSigningOut(true);
    setLogoutError("");
    try {
      clearRequestCache();
      const response = await fetch("/api/backend/api/auth/logout", {
        credentials: "same-origin",
        method: "POST",
      });
      if (!response.ok) throw new Error("logout failed");
      window.location.replace("/login?logged_out=1");
    } catch {
      setLogoutError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const identity = email || "Administrator";

  return (
    <RouteNavigationFeedback className={`admin-layout${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#admin-main">
        Skip to main content
      </a>
      {menuOpen ? (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop is-visible"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}

      <aside className={`admin-sidebar ${menuOpen ? "is-open" : ""}`} id="admin-navigation">
        <div className="sidebar-brand-row">
          <Link aria-label="Gathos administration home" className="sidebar-brand" href="/">
            <span aria-hidden="true" className="brand-mark">G</span>
            <span className="sidebar-brand-copy">
              <strong className="brand-wordmark">Gathos</strong>
              <small>Administration</small>
            </span>
          </Link>
          <button
            aria-label="Close navigation"
            className="icon-button sidebar-close"
            onClick={() => setMenuOpen(false)}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <nav aria-label="Admin navigation" className="sidebar-nav">
          <p className="sidebar-section-label">Overview</p>
          {NAV_ITEMS.filter((item) => item.href === "/" || item.href === "/gpu-health" || item.href === "/gpus").map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`sidebar-link ${active ? "is-active" : ""}`}
                href={item.href}
                key={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {RESOURCE_GROUPS.map((group) => (
            <details
              className="sidebar-group"
              key={`${group.id}:${pathname}:${sidebarCollapsed}`}
              open={sidebarCollapsed || group.hrefs.some((href) => isActivePath(pathname, href))}
            >
              <summary className="sidebar-group-heading">
                <span>{group.label}</span>
                <ChevronRightIcon />
              </summary>
              {group.hrefs.filter((href) => {
                const item = NAV_ITEMS.find((entry) => entry.href === href);
                return item && !item.hideFromSidebar;
              }).map((href) => {
                const item = NAV_ITEMS.find((entry) => entry.href === href)!;
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`sidebar-link ${active ? "is-active" : ""}`}
                    href={item.href}
                    key={item.href}
                    title={item.label}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </details>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="user-avatar">{identity.charAt(0).toUpperCase()}</span>
            <span className="user-copy">
              <strong title={identity}>{identity}</strong>
              <small>Admin access</small>
            </span>
            <button
              aria-label="Sign out"
              className="icon-button sidebar-logout"
              disabled={signingOut}
              onClick={handleLogout}
              title="Sign out"
              type="button"
            >
              <LogoutIcon />
            </button>
          </div>
          <p aria-live="polite" className="sidebar-error">
            {logoutError}
          </p>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="topbar-title">
            <button
              aria-controls="admin-navigation"
              aria-expanded={menuOpen}
              aria-label="Open navigation"
              className="icon-button mobile-menu-button"
              onClick={() => setMenuOpen(true)}
              type="button"
            >
              <MenuIcon />
            </button>
            <button
              aria-controls="admin-navigation"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              className="icon-button desktop-sidebar-toggle"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              type="button"
            >
              <ChevronRightIcon />
            </button>
            <nav aria-label="Breadcrumb" className="topbar-breadcrumbs">
              <Link href="/">Administration</Link>
              <ChevronRightIcon />
              {nestedRecordPage && currentItem ? (
                <>
                  <Link href={currentItem.href}>{currentItem.label}</Link>
                  <ChevronRightIcon />
                  <strong>{pathname === "/gpus/new" ? "Add GPU" : currentItem.href === "/gpus" ? "Manage GPU" : pathname.endsWith("/edit") ? "Edit record" : "View record"}</strong>
                </>
              ) : (
                <strong>{currentItem?.label || "Dashboard"}</strong>
              )}
            </nav>
          </div>

          <div className="topbar-actions">
            <span className="environment-badge">Production</span>
            <div className="admin-search-wrap">
              <form
                className="admin-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (matches[0]) openMatch(matches[0]);
                }}
                role="search"
              >
                <SearchIcon />
                <label className="sr-only" htmlFor="admin-global-search">
                  Search admin sections
                </label>
                <input
                  aria-controls={query.trim() ? "admin-search-results" : undefined}
                  autoComplete="off"
                  id="admin-global-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search models…"
                  ref={searchRef}
                  value={query}
                />
                <kbd>⌘ K</kbd>
              </form>

              {query.trim() ? (
                <div
                  aria-label="Search results"
                  className="search-results"
                  id="admin-search-results"
                >
                  {matches.length ? (
                    matches.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          className="search-result"
                          data-navigation-href={item.href}
                          data-navigation-label={item.label}
                          key={item.href}
                          onClick={() => openMatch(item)}
                          type="button"
                        >
                          <span className="search-result-icon">
                            <Icon />
                          </span>
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="search-empty">No models match “{query.trim()}”.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="admin-main" id="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </RouteNavigationFeedback>
  );
}
