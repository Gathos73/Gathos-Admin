import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/session-token";

type AdminCheckPayload = {
  authenticated?: boolean;
  email?: string;
  isAdmin?: boolean;
};

export type AdminAccess =
  | { status: "authorized"; email?: string }
  | { status: "unauthenticated" }
  | { status: "forbidden"; email?: string }
  | { status: "unavailable" };

export function getBackendUrl(): string {
  return (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
}

export async function getForwardedCookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const token = (await cookies()).get("gathos_session")?.value;
  if (!token) return { status: "unauthenticated" };
  if (process.env.SESSION_SECRET && !verifySession(token, process.env.SESSION_SECRET)) {
    return { status: "unauthenticated" };
  }
  const cookieHeader = `gathos_session=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(`${getBackendUrl()}/api/admin/check`, {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      signal: AbortSignal.timeout(5_000),
    });

    if (response.status === 401) {
      return { status: "unauthenticated" };
    }
    if (response.status === 403) {
      return { status: "forbidden" };
    }
    if (!response.ok) {
      return { status: "unavailable" };
    }

    const payload = (await response.json()) as AdminCheckPayload;
    if (payload.isAdmin === true) {
      return { status: "authorized", email: payload.email };
    }
    if (payload.authenticated === true) {
      return { status: "forbidden", email: payload.email };
    }
    return { status: "unauthenticated" };
  } catch {
    return { status: "unavailable" };
  }
});

export async function requireAdmin(): Promise<Extract<AdminAccess, { status: "authorized" }>> {
  const access = await getAdminAccess();

  if (access.status === "authorized") {
    return access;
  }

  const requestedPath = (await headers()).get("x-gathos-admin-path") || "/";
  const parameters = new URLSearchParams({ return_to: requestedPath });
  redirect(`/login?${parameters.toString()}`);
}
