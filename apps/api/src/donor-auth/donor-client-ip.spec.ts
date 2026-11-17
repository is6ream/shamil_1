import { createHmac } from 'node:crypto';
import { donorClientIp, signedDonorClientIp } from './donor-client-ip';
const request = (remote: string, xff: string) => ({ socket: { remoteAddress: remote }, headers: { 'x-forwarded-for': xff } });
describe('donor client IP trust boundary', () => {
  it('ignores forged XFF by default and from untrusted sockets', () => {
    expect(donorClientIp(request('192.0.2.10', '198.51.100.99'), [])).toBe('192.0.2.10');
    expect(donorClientIp(request('192.0.2.10', '198.51.100.99'), ['10.0.0.0/8'])).toBe('192.0.2.10');
  });
  it('walks only configured hops and ignores forged leftmost values', () => {
    expect(donorClientIp(request('::ffff:10.0.0.1', '203.0.113.99, 198.51.100.7, 10.1.0.2'), ['10.0.0.0/8'])).toBe('198.51.100.7');
  });
  it('supports IPv6 and fails conservatively on malformed chains or policy', () => {
    expect(donorClientIp(request('2001:db8::1', '2001:db9::2'), ['2001:db8::/32'])).toBe('2001:db9::2');
    expect(donorClientIp(request('10.0.0.1', 'unknown, 198.51.100.7'), ['10.0.0.0/8'])).toBe('10.0.0.1');
    expect(donorClientIp(request('10.0.0.1', '198.51.100.7'), ['invalid'])).toBe('10.0.0.1');
  });
});

it('accepts only fresh endpoint-bound BFF signatures and canonicalizes the bucket', () => {
  const secret = 'synthetic-ip-forwarding-secret-32-bytes';
  const now = 1794840000000; const assertion = `${now} ::ffff:198.51.100.7`;
  const endpoint = 'donor/auth/request-code';
  const signature = createHmac('sha256', secret).update(`${endpoint}\n${assertion}`).digest('hex');
  const value = `${assertion} ${signature}`;
  expect(signedDonorClientIp(value, endpoint, secret, now)).toBe('198.51.100.7');
  expect(signedDonorClientIp(value, endpoint, undefined, now)).toBeNull();
  expect(signedDonorClientIp(value, endpoint, secret, now+60001)).toBeNull();
  expect(signedDonorClientIp(value, endpoint, secret, now-60001)).toBeNull();
  expect(signedDonorClientIp(value, 'donor/auth/verify', secret, now)).toBeNull();
  expect(signedDonorClientIp(value.replace('198.51.100.7','198.51.100.8'), endpoint, secret, now)).toBeNull();
  expect(signedDonorClientIp('forged', endpoint, secret, now)).toBeNull();
});
