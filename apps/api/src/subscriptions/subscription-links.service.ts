import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import {
  CABINET_PATH,
  CANCEL_LINK_HMAC_DOMAIN,
  CANCEL_LINK_PATH,
  CANCEL_LINK_SIGNATURE_LENGTH,
} from './subscriptions.constants';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Ссылка отмены из письма: `<id подписки>.<HMAC>`. Подписанная, а не
 * одноразовая из таблицы: её можно положить в каждое письмо, не храня
 * токенов, а повторное нажатие на уже отменённую подписку — просто no-op.
 * Срока нет намеренно: отказаться от автосписаний человек вправе и по письму
 * полугодовой давности. Ссылка умеет только отменить — ничего не показывает.
 */
@Injectable()
export class SubscriptionLinksService {
  private readonly secret: string;
  private readonly siteUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.secret = config.get('donor', { infer: true }).hmacSecret;
    this.siteUrl = config.get('publicUrls', { infer: true }).siteUrl;
  }

  cancelToken(subscriptionId: string): string {
    return `${subscriptionId}.${this.sign(subscriptionId)}`;
  }

  /** id подписки из токена или `null`, если токен не наш. */
  verifyCancelToken(token: string): string | null {
    const [id, signature, extra] = token.split('.');

    if (id === undefined || signature === undefined || extra !== undefined || !UUID_PATTERN.test(id)) {
      return null;
    }

    const expected = Buffer.from(this.sign(id), 'utf8');
    const received = Buffer.from(signature.toLowerCase(), 'utf8');

    return expected.length === received.length && timingSafeEqual(expected, received) ? id : null;
  }

  cancelUrl(subscriptionId: string): string {
    const url = new URL(`${this.siteUrl}${CANCEL_LINK_PATH}`);

    url.searchParams.set('token', this.cancelToken(subscriptionId));

    return url.toString();
  }

  cabinetUrl(): string {
    return `${this.siteUrl}${CABINET_PATH}`;
  }

  private sign(subscriptionId: string): string {
    return createHmac('sha256', this.secret)
      .update(`${CANCEL_LINK_HMAC_DOMAIN}:${subscriptionId}`, 'utf8')
      .digest('hex')
      .slice(0, CANCEL_LINK_SIGNATURE_LENGTH);
  }
}
