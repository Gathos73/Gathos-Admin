import type { NextRequest } from "next/server";

import { getBackendUrl } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const CLIENT_IDENTITY_HEADERS = new Set([
  "cf-connecting-ip",
  "fastly-client-ip",
  "fly-client-ip",
  "forwarded",
  "true-client-ip",
  "x-client-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
]);
const MAX_BODY_BYTES = 1_048_576;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_AUTH_PATHS = new Set(["api/auth/logout"]);

function isAllowedPath(path: string[]): boolean {
  const joined = path.join("/");
  return joined.startsWith("api/admin/") || ALLOWED_AUTH_PATHS.has(joined);
}

function isSameOriginMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin;
}

async function readRequestBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new RangeError("request body too large");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("request body too large");
    }
    chunks.push(value);
  }
  if (total === 0) return undefined;

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer as ArrayBuffer;
}

function requestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  for (const name of CLIENT_IDENTITY_HEADERS) {
    headers.delete(name);
  }
  headers.set("x-gathos-client", "admin-bff");
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();

  upstream.headers.forEach((value, name) => {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  });

  const upstreamHeaders = upstream.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = upstreamHeaders.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      headers.append("set-cookie", cookie);
    }
  } else {
    const cookie = upstream.headers.get("set-cookie");
    if (cookie) {
      headers.append("set-cookie", cookie);
    }
  }

  return headers;
}

async function forward(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  if (!isAllowedPath(path)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!isSameOriginMutation(request)) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }

  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const upstreamUrl = new URL(`${getBackendUrl()}/${safePath}`);
  upstreamUrl.search = request.nextUrl.search;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let rawBody: ArrayBuffer | undefined;
  try {
    rawBody = hasBody ? await readRequestBody(request) : undefined;
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: "request_too_large" }, { status: 413 });
    }
    return Response.json({ error: "invalid_request_body" }, { status: 400 });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      body: rawBody,
      cache: "no-store",
      headers: requestHeaders(request),
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    });

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      headers: responseHeaders(upstream),
      status: upstream.status,
      statusText: upstream.statusText,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json(
        { error: "backend_timeout", message: "The admin API timed out." },
        { status: 504 },
      );
    }
    return Response.json(
      {
        error: "backend_unavailable",
        message: "The admin API is temporarily unavailable.",
      },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;
export const OPTIONS = forward;
