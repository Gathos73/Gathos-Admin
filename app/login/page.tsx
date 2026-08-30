import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountSwitchButton } from "@/components/account-switch-button";
import { AdminLoginForm } from "@/components/admin-login-form";
import { getAdminAccess } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{
    logged_out?: string | string[];
    return_to?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeAdminPath(value: string | string[] | undefined): string {
  const candidate = firstValue(value);
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.startsWith("/login")
  ) {
    return "/";
  }
  return candidate;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnPath = safeAdminPath(params.return_to);
  const access = await getAdminAccess();
  const loggedOut = firstValue(params.logged_out);

  if (access.status === "authorized") {
    redirect(returnPath);
  }

  const unavailable = access.status === "unavailable";
  const forbidden = access.status === "forbidden";

  return (
    <main className="login-page">
      <div className="login-shell">
        <div className="login-panel">
          <section className="login-card" aria-labelledby="login-heading">
            <div className="login-brand">
              <strong className="login-wordmark">Gathos</strong>
              <span>Administration</span>
            </div>

            <span className="resource-eyebrow">Secure operations</span>
            <h1 id="login-heading">Welcome back to Gathos Admin</h1>
            <p className="login-intro">
              Sign in with an approved administrator email and password. An existing session on
              this domain is checked automatically before this page is shown.
            </p>

            {loggedOut === "1" ? (
              <div className="login-notice is-success">You have been signed out securely.</div>
            ) : null}
            {forbidden ? (
              <div className="login-notice is-warning" role="alert">
                <strong>No administrator permission</strong>
                <span>
                  {access.status === "forbidden" && access.email
                    ? `${access.email} is signed in, but it is not approved to use this console.`
                    : "This account is signed in, but it is not approved to use this console."}
                </span>
              </div>
            ) : null}
            {unavailable ? (
              <div className="login-notice is-warning">
                The admin API cannot be reached right now. Access remains closed until it recovers.
              </div>
            ) : null}

            {forbidden ? (
              <AccountSwitchButton returnPath={returnPath} />
            ) : (
              <AdminLoginForm returnPath={returnPath} />
            )}

            <p className="login-help">
              Email and password only. Contact the platform owner if your account needs
              administrator permission.
            </p>
          </section>
        </div>

        <aside aria-hidden="true" className="login-showcase">
          <div className="login-showcase-grid" />
          <div className="login-showcase-copy">
            <span>Internal operations</span>
            <strong>Everything needed to run Gathos, in one focused workspace.</strong>
            <div className="login-showcase-models">
              <span>Users</span>
              <span>API keys</span>
              <span>Generations</span>
              <span>Security</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
