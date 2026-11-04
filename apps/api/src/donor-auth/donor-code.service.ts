import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { confirmEmailMail, deleteAccountMail, loginCodeMail } from '../mail/mail-templates';
import { MAIL_SENDER } from '../mail/mail.types';
import type { MailMessage, MailSender } from '../mail/mail.types';
import {
  CODE_HOURLY_LIMIT,
  CODE_HOURLY_LIMIT_PER_IP,
  CODE_RESEND_INTERVAL_MS,
  CODE_WINDOW_MS,
  LOGIN_CODE_HMAC_DOMAIN,
  LOGIN_CODE_TTL_MINUTES,
  LOGIN_CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
} from './donor-auth.constants';
import type { CodePurpose } from './donor-auth.constants';
import { generateLoginCode, hashLoginCode, loginCodeMatches } from './login-code';

/** Один текст на все неудачи ввода кода: что именно не так — подсказка подбирающему. */
export const WRONG_CODE = 'Код неверный или устарел — запросите новый';

const MAIL_BY_PURPOSE: Readonly<Record<CodePurpose, (to: string, code: string, ttl: number) => MailMessage>> = {
  login: loginCodeMail,
  change_email: confirmEmailMail,
  delete_account: deleteAccountMail,
};

export interface CodeTarget {
  readonly purpose: CodePurpose;
  readonly email: string;
  /** Чей код. `null` — только у входа: аккаунта может ещё не быть. */
  readonly donorId: string | null;
}

/**
 * Одноразовые коды на e-mail: вход, подтверждение нового адреса, удаление
 * кабинета. В базе — только HMAC, код живёт 10 минут, пять попыток,
 * новый код вытесняет старый того же назначения.
 */
@Injectable()
export class DonorCodeService {
  private readonly logger = new Logger(DonorCodeService.name);
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    config: ConfigService<AppConfig, true>,
  ) {
    this.hmacSecret = config.get('donor', { infer: true }).hmacSecret;
  }

  /**
   * Отправляет код. Ничего не возвращает: вызывающий отвечает одинаково
   * при любом исходе — есть ли такой аккаунт, сработал ли лимит, — иначе
   * форма входа стала бы способом проверить, жертвует ли человек мечети.
   */
  async issue(target: CodeTarget, ip: string | null, now: Date = new Date()): Promise<void> {
    const code = generateLoginCode();
    const issued = await this.prisma.$transaction(async (tx) => {
      // Лимит и вставка — под одной блокировкой на адрес: иначе параллельные
      // запросы прочитают «кодов ещё не было» и разошлют по письму каждый.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${LOGIN_CODE_HMAC_DOMAIN}:${target.email}`}, 0))`;

      if (await isRateLimited(tx, target.email, ip, now)) {
        return false;
      }

      // Новый код вытесняет старые того же назначения: действует только последнее письмо.
      await tx.donorAuthCode.updateMany({
        where: { email: target.email, purpose: target.purpose, donorId: target.donorId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.donorAuthCode.create({
        data: {
          email: target.email,
          purpose: target.purpose,
          donorId: target.donorId,
          ip,
          codeHash: hashLoginCode(this.hmacSecret, target.purpose, target.email, code),
          expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MS),
        },
      });

      return true;
    });

    if (!issued) {
      this.logger.warn(`Лимит кодов исчерпан (${target.purpose}) — письмо не отправлено`);

      return;
    }

    try {
      await this.mail.send(MAIL_BY_PURPOSE[target.purpose](target.email, code, LOGIN_CODE_TTL_MINUTES));
    } catch (error: unknown) {
      // Ответ всё равно одинаковый; человек запросит код повторно.
      this.logger.error('Письмо с кодом не отправлено', error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Гасит верный код или бросает 401. Не больше пяти попыток; из двух
   * одновременных верных вводов проходит ровно один.
   */
  async consume(target: CodeTarget, code: string, now: Date = new Date()): Promise<void> {
    const stored = await this.prisma.donorAuthCode.findFirst({
      where: {
        email: target.email,
        purpose: target.purpose,
        donorId: target.donorId,
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });

    if (stored === null) {
      throw new UnauthorizedException(WRONG_CODE);
    }

    // Попытка списывается ДО сравнения и условным UPDATE: N параллельных
    // запросов на последней попытке дадут одно сравнение, а не N.
    const reserved = await this.prisma.donorAuthCode.updateMany({
      where: { id: stored.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });

    if (
      reserved.count === 0 ||
      !loginCodeMatches(this.hmacSecret, target.purpose, target.email, code, stored.codeHash)
    ) {
      throw new UnauthorizedException(WRONG_CODE);
    }

    // Гасим код условным UPDATE: из двух одновременных верных вводов проходит ровно один.
    const consumed = await this.prisma.donorAuthCode.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw new UnauthorizedException(WRONG_CODE);
    }
  }

}

/**
 * Не чаще раза в минуту и не больше пяти за час на адрес, двадцать за час с IP.
 * Вызывать под блокировкой адреса.
 */
async function isRateLimited(
  tx: Prisma.TransactionClient,
  email: string,
  ip: string | null,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - CODE_WINDOW_MS);
  const [recent, fromIp] = await Promise.all([
    tx.donorAuthCode.findMany({
      where: { email, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
      take: CODE_HOURLY_LIMIT,
    }),
    ip === null ? Promise.resolve(0) : tx.donorAuthCode.count({ where: { ip, createdAt: { gt: since } } }),
  ]);
  const latest = recent[0];

  return (
    recent.length >= CODE_HOURLY_LIMIT ||
    fromIp >= CODE_HOURLY_LIMIT_PER_IP ||
    (latest !== undefined && now.getTime() - latest.createdAt.getTime() < CODE_RESEND_INTERVAL_MS)
  );
}
