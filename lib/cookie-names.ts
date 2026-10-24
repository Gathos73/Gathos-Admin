import "server-only";

/** Match the backend COOKIE_PREFIX; empty preserves existing deployments. */
export function cookieName(name: string): string {
  return `${process.env.COOKIE_PREFIX || ""}${name}`;
}
