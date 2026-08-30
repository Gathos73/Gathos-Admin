import Link from "next/link";

import { DashboardIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="state-page">
      <div className="state-card">
        <span className="state-code">404</span>
        <p className="section-kicker">Not found</p>
        <h1>This admin page does not exist</h1>
        <p>The address may be outdated, or the requested model is not available in this console.</p>
        <Link className="button button--primary" href="/">
          <DashboardIcon />
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
