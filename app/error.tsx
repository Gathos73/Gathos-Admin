"use client";

import { AlertIcon, RefreshIcon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="state-page">
      <div className="state-card">
        <span className="state-icon state-icon--error">
          <AlertIcon />
        </span>
        <p className="section-kicker">Unexpected error</p>
        <h1>Something went wrong</h1>
        <p>
          The admin view could not be loaded. Try loading the page again.
        </p>
        {process.env.NODE_ENV === "development" ? (
          <pre className="detail-json" style={{ maxWidth: "100%", textAlign: "left", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {error.message}
          </pre>
        ) : null}
        {error.digest ? <small className="error-reference">Reference: {error.digest}</small> : null}
        <button className="button button--primary" onClick={reset} type="button">
          <RefreshIcon />
          Try again
        </button>
      </div>
    </main>
  );
}
