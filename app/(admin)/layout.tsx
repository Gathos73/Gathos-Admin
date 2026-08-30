import { Suspense, type ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/server-auth";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <Suspense fallback={<AdminShellFallback />}>
      <AdminShell email={admin.email}>{children}</AdminShell>
    </Suspense>
  );
}

function AdminShellFallback() {
  return (
    <div aria-busy="true" aria-label="Loading administration" className="admin-layout shell-fallback">
      <aside className="admin-sidebar shell-fallback-sidebar">
        <div className="sidebar-brand-row">
          <span className="sidebar-brand">
            <span aria-hidden="true" className="brand-mark">G</span>
            <span className="sidebar-brand-copy">
              <strong className="brand-wordmark">Gathos</strong>
              <small>Administration</small>
            </span>
          </span>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="skeleton skeleton--fallback-title" />
          <div className="skeleton skeleton--fallback-search" />
        </header>
        <main className="admin-main">
          <div className="skeleton skeleton--eyebrow" />
          <div className="skeleton skeleton--title" />
          <div className="loading-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton skeleton--card" key={index} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
