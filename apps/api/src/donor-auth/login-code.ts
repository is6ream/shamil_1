import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { LOGIN_CODE_HMAC_DOMAIN, LOGIN_CODE_LENGTH } from './donor-auth.constants';
import type { CodePurpose } from './donor-auth.constants';

/** Код входа: 6 цифр из криптостойкого генератора, ведущие нули сохраняются. */
export function generateLoginCode(): string {
  return randomInt(0, 10 ** LOGIN_CODE_LENGTH)
    .toString()
    .padStart(LOGIN_CODE_LENGTH, '0');
}

/**
 * В базе — только HMAC-SHA256 от кода. 10⁶ вариантов перебираются мгновенно,
 * поэтому голый SHA-256 из утёкшей таблицы восстанавливался бы за секунду;
 * без ключа HMAC — нет. E-mail и назначение входят в строку: один и тот же
 * код у двух адресов даёт разные хеши, а код смены адреса не подходит для входа.
 */
export function hashLoginCode(secret: string, purpose: CodePurpose, email: string, code: string): string {
  return createHmac('sha256', secret)
    .update(`${LOGIN_CODE_HMAC_DOMAIN}:${purpose}:${email}:${code}`, 'utf8')
    .digest('hex');
}

export function loginCodeMatches(
  secret: string,
  purpose: CodePurpose,
  email: string,
  code: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(hashLoginCode(secret, purpose, email, code), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');

  return expected.length === stored.length && timingSafeEqual(expected, stored);
}

/** E-mail в том виде, в каком он хранится: CHECK `donor_user_email_lowercase`. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
