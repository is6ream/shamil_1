import { Injectable } from '@nestjs/common';
import { tokenHash } from './donor-auth.crypto';
import { donorError } from './donor-auth.errors';

/** Singleton per Nest process. Multi-instance deployment MUST add a shared ingress limiter. */
@Injectable()
export class DonorIpLimiter {
  private readonly buckets = new Map<string, { times: number[]; windowMs: number }>();

  take(action: 'send' | 'verify', ip: string, now = Date.now()): void {
    const windowMs = action === 'send' ? 3_600_000 : 600_000;
    const maximum = action === 'send' ? 10 : 20;
    // Do not retain raw IP addresses; never trust a client-provided forwarded header here.
    const key = `${action}:${tokenHash(ip)}`;
    for (const [storedKey, bucket] of this.buckets) {
      if ((bucket.times.at(-1) ?? 0) + bucket.windowMs <= now) this.buckets.delete(storedKey);
    }
    const times = (this.buckets.get(key)?.times ?? []).filter(time => time > now - windowMs);
    const first = times[0];
    if (times.length >= maximum && first !== undefined) this.reject(Math.max(1, Math.ceil((first + windowMs - now) / 1000)));
    // Bound memory without evicting live limits (eviction would permit bypass).
    if (!this.buckets.has(key) && this.buckets.size >= 10_000) this.reject(60);
    times.push(now);
    this.buckets.set(key, { times, windowMs });
  }

  private reject(seconds: number): never {
    throw donorError(429, 'RATE_LIMITED', 'Повторите попытку позже', seconds);
  }
}
