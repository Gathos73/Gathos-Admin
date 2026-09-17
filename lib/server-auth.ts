import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/session-token";
import type { ResourceKey, ResourceListResponse, ResourceQuery } from "@/lib/types";

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

export async function getServerResourceList(
  resource: ResourceKey,
  query: ResourceQuery,
): Promise<ResourceListResponse | null> {
  const token = (await cookies()).get("gathos_session")?.value;
  if (!token) return null;
  const parameters = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    order_by: query.orderBy,
    descending: String(query.descending),
  });
  try {
    const response = await fetch(
      `${getBackendUrl()}/api/admin/resources/${resource}?${parameters.toString()}`,
      {
        cache: "no-store",
        headers: { cookie: `gathos_session=${encodeURIComponent(token)}` },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    return await response.json() as ResourceListResponse;
  } catch {
    return null;
  }
}

export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const token = (await cookies()).get("gathos_session")?.value;
  if (!token) return { status: "unauthenticated" };
  const secret = process.env.SESSION_SECRET;
  const identity = secret ? verifySession(token, secret) : null;
  if (secret && !identity) return { status: "unauthenticated" };
  if (identity?.is_superuser === true) {
    return { status: "authorized", email: identity.email };
  }
  if (identity?.is_superuser === false) {
    return { status: "forbidden", email: identity.email };
  }
  const cookieHeader = `gathos_session=${encodeURIComponent(token)}`;

  // Sessions issued before the is_superuser claim was introduced get one
  // compatibility check. New sessions never add a separate layout request;
  // every admin data API still verifies current database authorization.
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
