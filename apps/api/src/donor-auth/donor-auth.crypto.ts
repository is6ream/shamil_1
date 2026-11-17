import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { isEmail } from 'class-validator';
import { donorError } from './donor-auth.errors';

export function normalizeEmail(input: string): string {
  if (typeof input !== 'string' || /[^\x20-\x7e]/.test(input)) {
    throw donorError(400, 'VALIDATION_ERROR', 'Укажите email латинскими символами');
  }
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !isEmail(email, { allow_utf8_local_part: false })) {
    throw donorError(400, 'VALIDATION_ERROR', 'Укажите корректный email');
  }
  return email;
}

export const generateCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');
export const generateSessionToken = (): string => randomBytes(32).toString('base64url');
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
export const codeHash = (secret: string, id: string, email: string, code: string): string =>
  createHmac('sha256', secret).update(`${id}\n${email}\n${code}`).digest('hex');
export function codeMatches(actual: string, expected: string): boolean {
  return /^[a-f0-9]{64}$/.test(actual) && /^[a-f0-9]{64}$/.test(expected)
    && timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
