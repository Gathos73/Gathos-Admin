import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionIdentity = {
  userId: string;
  email: string;
  iat: number;
  exp: number;
  is_superuser?: boolean;
};

// Called only by server-only modules. Matches FastAPI's signed JSON envelope.
export function verifySession(token: string, secret: string, now = Date.now() / 1000): SessionIdentity | null {
  try {
    if (!secret || token.length > 16384) return null;
    const envelope = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (typeof envelope.data !== "string" || typeof envelope.signature !== "string"
      || !/^[a-f0-9]{64}$/.test(envelope.signature)) return null;
    const expected = createHmac("sha256", secret).update(envelope.data).digest();
    if (!timingSafeEqual(expected, Buffer.from(envelope.signature, "hex"))) return null;
    const payload = JSON.parse(envelope.data);
    if (!payload || typeof payload !== "object"
      || typeof payload.userId !== "string" || !payload.userId
      || typeof payload.email !== "string" || !payload.email
      || typeof payload.iat !== "number" || !Number.isFinite(payload.iat)
      || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)
      || payload.exp <= payload.iat || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
