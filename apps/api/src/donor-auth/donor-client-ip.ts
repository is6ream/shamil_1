import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import ipaddr from 'ipaddr.js';

/** Walk from the socket outwards; stop at the first untrusted address. Empty policy ignores XFF.
 * BFF intentionally forwards no client IP until its ingress chain has been verified.
 * A shared BFF bucket is conservative but is a rollout blocker, not a per-user limiter.
 */
export function donorClientIp(request: Pick<Request, 'headers'> & { socket: { remoteAddress?: string } }, cidrs: readonly string[]): string {
  const remote = request.socket.remoteAddress;
  if (!remote) return 'unknown';
  try {
    const ranges = cidrs.map(value => ipaddr.parseCIDR(value));
    const trusted = (value: string) => {
      const address = ipaddr.process(value);
      return ranges.some(([network, prefix]) => address.kind() === network.kind() && (address.kind() === 'ipv4'
        ? (address as ipaddr.IPv4).match(network as ipaddr.IPv4, prefix)
        : (address as ipaddr.IPv6).match(network as ipaddr.IPv6, prefix)));
    };
    let current = remote;
    const forwarded = request.headers['x-forwarded-for'];
    if (!ranges.length || typeof forwarded !== 'string' || forwarded.length > 2048) return ipaddr.process(remote).toString();
    const hops = forwarded.split(',').map(value => value.trim());
    if (hops.length > 16 || hops.some(value => !ipaddr.isValid(value))) return ipaddr.process(remote).toString();
    for (const hop of hops.reverse()) {
      if (!trusted(current)) break;
      current = hop;
    }
    return ipaddr.process(current).toString();
  } catch { return remote; }
}

/** A signature proves BFF origin, not the correctness of its ingress configuration. */
export function signedDonorClientIp(header: unknown, endpoint: string, secret: string | undefined, now = Date.now()): string | null {
  if (!secret || Buffer.byteLength(secret) < 32 || typeof header !== 'string' || header.length > 200) return null;
  const parts = /^(\d{13}) ([0-9a-fA-F:.]+) ([0-9a-f]{64})$/.exec(header);
  const timestamp = parts?.[1], ip = parts?.[2], signature = parts?.[3];
  if (!timestamp || !ip || !signature || Math.abs(now - Number(timestamp)) > 60000 || !ipaddr.isValid(ip)) return null;
  const expected = createHmac('sha256', secret).update(`${endpoint}\n${timestamp} ${ip}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
  return ipaddr.process(ip).toString();
}
