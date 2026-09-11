"use client";

import { clearRequestCache } from "@/lib/request-cache";

import { useState } from "react";

export function AccountSwitchButton({ returnPath }: { returnPath: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function switchAccount() {
    setSubmitting(true);
    setError("");
    try {
      clearRequestCache();
      const response = await fetch("/api/backend/api/auth/logout", {
        credentials: "same-origin",
        method: "POST",
      });
      if (!response.ok) throw new Error("logout failed");
      window.location.replace(
        `/login?logged_out=1&return_to=${encodeURIComponent(returnPath)}`,
      );
    } catch {
      setError("Could not sign out. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        className="login-button login-button--secondary"
        disabled={submitting}
        onClick={switchAccount}
        type="button"
      >
        {submitting ? "Signing out…" : "Sign out and use another account"}
      </button>
      {error ? (
        <p className="login-inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
