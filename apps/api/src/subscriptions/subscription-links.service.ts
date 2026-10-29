import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import {
  CABINET_PATH,
  CANCEL_LINK_HMAC_DOMAIN,
  CANCEL_LINK_PATH,
  CANCEL_LINK_SIGNATURE_LENGTH,
  CANCEL_LINK_TTL_MS,
} from './subscriptions.constants';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXPIRES_PATTERN = /^[1-9]\d{0,11}$/;

/** Итог проверки токена: истёкший отличаем от поддельного, чтобы предложить вход в кабинет. */
export type CancelTokenCheck =
  | { readonly kind: 'valid'; readonly subscriptionId: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'invalid' };

/**
 * Ссылка отмены из письма: `<id подписки>.<срок, unix-секунды>.<HMAC>`.
 * Подписанная, а не одноразовая из таблицы: её можно положить в каждое
 * письмо, не храня токенов, а повторное нажатие на уже отменённую подписку —
 * просто no-op.
 *
 * Срок — `CANCEL_LINK_TTL_MS` с момента письма: пересланное или утёкшее
 * письмо не должно годами оставаться ключом к чужой подписке. Каждое письмо
 * о списании несёт свежую ссылку, а отменить по истёкшей можно в кабинете.
 * Ссылка умеет только отменить — ничего не показывает.
 */
@Injectable()
export class SubscriptionLinksService {
  private readonly secret: string;
  private readonly siteUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.secret = config.get('donor', { infer: true }).hmacSecret;
    this.siteUrl = config.get('publicUrls', { infer: true }).siteUrl;
  }

  cancelToken(subscriptionId: string, now: Date = new Date()): string {
    const expiresAt = Math.floor((now.getTime() + CANCEL_LINK_TTL_MS) / 1000).toString();

    return `${subscriptionId}.${expiresAt}.${this.sign(subscriptionId, expiresAt)}`;
  }

  /** Подпись проверяется раньше срока: о сроке узнаёт только владелец настоящей ссылки. */
  checkCancelToken(token: string, now: Date = new Date()): CancelTokenCheck {
    const [id, expiresAt, signature, extra] = token.split('.');

    if (
      id === undefined ||
      expiresAt === undefined ||
      signature === undefined ||
      extra !== undefined ||
      !UUID_PATTERN.test(id) ||
      !EXPIRES_PATTERN.test(expiresAt)
    ) {
      return { kind: 'invalid' };
    }

    const expected = Buffer.from(this.sign(id, expiresAt), 'utf8');
    const received = Buffer.from(signature.toLowerCase(), 'utf8');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return { kind: 'invalid' };
    }

    return Number(expiresAt) * 1000 <= now.getTime() ? { kind: 'expired' } : { kind: 'valid', subscriptionId: id };
  }

  cancelUrl(subscriptionId: string, now: Date = new Date()): string {
    const url = new URL(`${this.siteUrl}${CANCEL_LINK_PATH}`);

    url.searchParams.set('token', this.cancelToken(subscriptionId, now));

    return url.toString();
  }

  cabinetUrl(): string {
    return `${this.siteUrl}${CABINET_PATH}`;
  }

  private sign(subscriptionId: string, expiresAt: string): string {
    return createHmac('sha256', this.secret)
      .update(`${CANCEL_LINK_HMAC_DOMAIN}:${subscriptionId}:${expiresAt}`, 'utf8')
      .digest('hex')
      .slice(0, CANCEL_LINK_SIGNATURE_LENGTH);
  }
}
