import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';

/**
 * Теги кеша сайта. Список фиксированный и совпадает с фронтендом
 * (`apps/web/lib/revalidate.ts`, D-F02): неизвестный тег фронт отклонит.
 */
export const REVALIDATE_TAGS = ['content', 'stages', 'news', 'gallery', 'video', 'campaign'] as const;

export type RevalidateTag = (typeof REVALIDATE_TAGS)[number];

/** Сколько ждать фронт. Сохранение в админке не должно зависать из-за сайта. */
export const REVALIDATE_TIMEOUT_MS = 5_000;

/**
 * Сброс кеша страниц Next.js после правки в админке (D-14).
 *
 * `POST {WEB_REVALIDATE_URL}` с `Authorization: Bearer <REVALIDATE_SECRET>`
 * и телом `{ "tags": [...] }` — контракт задаёт фронт (D-F02).
 *
 * Вызов асинхронный и не ждётся обработчиком: сохранение уже закоммичено,
 * и сбой сайта его не откатывает — правка просто появится на сайте по
 * истечении кеша. Сбой — `logger.warn`, без секрета в тексте.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);
  private readonly secret: string | undefined;
  private readonly url: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const revalidation = config.get('revalidation', { infer: true });

    this.secret = revalidation.secret;
    this.url = revalidation.url;
  }

  /** Запустить и забыть. Возвращаемый промис нужен только тестам. */
  notify(tags: readonly RevalidateTag[]): Promise<void> {
    return this.send(tags).catch((error: unknown) => {
      this.logger.warn(
        `Ревалидация сайта (${tags.join(', ')}) не удалась: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private async send(tags: readonly RevalidateTag[]): Promise<void> {
    if (this.secret === undefined || tags.length === 0) {
      return;
    }

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.secret}` },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`сайт ответил ${response.status}`);
    }
  }
}
