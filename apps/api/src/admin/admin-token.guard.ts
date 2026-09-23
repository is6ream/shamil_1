import { createHash, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';

const BEARER_PREFIX = 'Bearer ';

/**
 * Запрос ровно в том объёме, который нужен гарду. Типы Express сюда не
 * затаскиваем: гарду достаточно заголовков, а лишняя зависимость от
 * HTTP-адаптера потом мешает подменить платформу.
 */
interface RequestWithHeaders {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Сравнение за постоянное время по SHA-256-отпечаткам.
 *
 * Отпечатки, а не сами строки: `timingSafeEqual` требует одинаковой длины
 * буферов и падает на разной, а проверка длины до сравнения выдала бы длину
 * токена по времени ответа. Дайджесты всегда 32 байта — сравнивать можно
 * что угодно с чем угодно.
 */
function isSameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(given, 'utf8').digest(),
    createHash('sha256').update(expected, 'utf8').digest(),
  );
}

/**
 * Авторизация админских эндпоинтов статическим токеном.
 *
 * Полноценной аутентификации в MVP нет: админка — это защищённые эндпоинты,
 * а не UI (CLAUDE.md, «Платежи»). Заказчик дёргает их curl'ом или из Postman,
 * и единственный общий секрет здесь честнее, чем самописные сессии,
 * написанные за два часа до дедлайна.
 *
 * Токен приходит в `Authorization: Bearer <token>`. Стандартный заголовок
 * выбран не для красоты: в отличие от query-параметра он не оседает
 * в access-логах Nginx, в истории браузера и в Referer.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly logger = new Logger(AdminTokenGuard.name);

  private readonly token: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.token = config.get('admin', { infer: true }).apiToken;
  }

  canActivate(context: ExecutionContext): boolean {
    // Пустой токен — это «закрыто», а не «выключено». В production переменная
    // обязательна (env.validation.ts), но в dev её может не быть, и открытый
    // эндпоинт подтверждения донатов — совсем не то, чем должна
    // оборачиваться забытая строка в .env.
    if (this.token.length === 0) {
      this.logger.error('ADMIN_API_TOKEN не задан — админские эндпоинты закрыты полностью');

      throw new UnauthorizedException('Админский доступ не настроен');
    }

    const header = context.switchToHttp().getRequest<RequestWithHeaders>().headers.authorization;

    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Нужен заголовок Authorization: Bearer <token>');
    }

    if (!isSameSecret(header.slice(BEARER_PREFIX.length), this.token)) {
      // Сам токен в лог не попадает ни при каких обстоятельствах.
      this.logger.warn('Запрос к админскому эндпоинту с неверным токеном отклонён');

      throw new UnauthorizedException('Неверный админский токен');
    }

    return true;
  }
}
