import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";

/** Enable only after proving the named ingress header is overwritten at every public entry.
 * Never default to XFF. Assertion is server-to-server only and bound to endpoint/time.
 */
export function donorIpHeaders(request: NextRequest, endpoint: string): Record<string, string> {
  const secret = process.env.DONOR_IP_FORWARDING_SECRET;
  const header = process.env.DONOR_WEB_CLIENT_IP_HEADER;
  if (!secret || Buffer.byteLength(secret) < 32 || !header || !/^[a-z0-9-]+$/i.test(header)) return {};
  const ip = request.headers.get(header)?.trim();
  if (!ip || !isIP(ip) || !/^donor\/auth\/(request-code|verify)$/.test(endpoint)) return {};
  const assertion = `${Date.now()} ${ip}`;
  const signature = createHmac("sha256", secret).update(`${endpoint}\n${assertion}`).digest("hex");
  return { "X-Shamil-Donor-Ip": `${assertion} ${signature}` };
}
