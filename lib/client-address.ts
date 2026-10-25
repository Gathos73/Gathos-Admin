import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Only enable with a header overwritten by the trusted hosting edge. */
export function signClientAddress(incoming: Headers, outgoing: Headers, method: string, path: string): void {
  for (const name of ["x-gathos-client-ip", "x-gathos-client-time", "x-gathos-client-signature"]) outgoing.delete(name);
  const secret = process.env.BFF_FORWARDING_SECRET || "";
  const trustedHeader = process.env.BFF_TRUSTED_CLIENT_IP_HEADER;
  const ip = trustedHeader ? incoming.get(trustedHeader)?.trim() : undefined;
  if (secret.length < 32 || !ip || !isIP(ip)) return;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = [timestamp, method, path, ip].join("\n");
  outgoing.set("x-gathos-client-ip", ip);
  outgoing.set("x-gathos-client-time", timestamp);
  outgoing.set("x-gathos-client-signature", createHmac("sha256", secret).update(payload).digest("hex"));
}
