"use client";

import {
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

type ErrorPayload = {
  detail?: unknown;
  error?: unknown;
  message?: unknown;
};

function payloadMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const { detail, error, message } = payload as ErrorPayload;
  for (const candidate of [error, message, detail]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  return payloadMessage(payload) || fallback;
}

const subscribeToClient = () => () => {};

function useHasMounted(): boolean {
  return useSyncExternalStore(subscribeToClient, () => true, () => false);
}

export function AdminLoginForm({ returnPath }: { returnPath: string }) {
  const hasMounted = useHasMounted();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const loginResponse = await fetch("/api/backend/api/admin/login", {
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!loginResponse.ok) {
        setError(
          await errorMessage(
            loginResponse,
            "Could not sign in with that email and password.",
          ),
        );
        return;
      }

      // The login endpoint already checks the active admin role. The destination
      // layout rechecks permissions before rendering protected content.
      window.location.replace(returnPath);
    } catch {
      setError("The backend is unavailable right now. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  // Credential-manager extensions commonly decorate inputs before React
  // hydrates, adding inline styles and sibling buttons that were not present
  // in the server HTML. Mount the fields after hydration so React and the
  // server compare the same stable placeholder first.
  if (!hasMounted) {
    return <div aria-busy="true" aria-label="Loading sign-in form" className="admin-login-form-placeholder" />;
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <div className="login-field">
        <label htmlFor="admin-email">Email</label>
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoFocus
          disabled={submitting}
          id="admin-email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          spellCheck={false}
          type="email"
          value={email}
        />
      </div>
      <div className="login-field">
        <label htmlFor="admin-password">Password</label>
        <input
          autoComplete="current-password"
          disabled={submitting}
          id="admin-password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      {error ? (
        <p className="login-inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        aria-busy={submitting}
        className="login-button"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Checking access…" : "Sign in to administration"}
      </button>
    </form>
  );
}
