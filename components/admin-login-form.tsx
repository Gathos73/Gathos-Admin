"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { AccountSwitchButton } from "@/components/account-switch-button";

type AdminCheckPayload = {
  authenticated?: boolean;
  email?: string;
  isAdmin?: boolean;
};

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
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null);
  const deniedNoticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deniedEmail) deniedNoticeRef.current?.focus();
  }, [deniedEmail]);

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

      const permissionResponse = await fetch("/api/backend/api/admin/check", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!permissionResponse.ok) {
        setError("Signed in, but administrator permission could not be confirmed. Try again.");
        return;
      }

      const permission = (await permissionResponse.json()) as AdminCheckPayload;
      if (permission.isAdmin === true) {
        window.location.replace(returnPath);
        return;
      }
      if (permission.authenticated === true) {
        setDeniedEmail(permission.email || email.trim().toLowerCase());
        setPassword("");
        return;
      }

      setError("The backend accepted the login but did not establish a session. Try again.");
    } catch {
      setError("The backend is unavailable right now. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  if (deniedEmail) {
    return (
      <div className="login-permission-state">
        <div
          className="login-notice is-warning"
          ref={deniedNoticeRef}
          role="alert"
          tabIndex={-1}
        >
          <strong>No administrator permission</strong>
          <span>
            {deniedEmail} is signed in, but it is not approved to use this console.
          </span>
        </div>
        <AccountSwitchButton returnPath={returnPath} />
      </div>
    );
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
