import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../database/prisma.service';
import { loginCodeMail } from '../mail/mail-templates';
import { MAIL_SENDER } from '../mail/mail.types';
import type { MailSender } from '../mail/mail.types';
import {
  CODE_HOURLY_LIMIT,
  CODE_RESEND_INTERVAL_MS,
  CODE_WINDOW_MS,
  LOGIN_CODE_TTL_MINUTES,
  LOGIN_CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
} from './donor-auth.constants';
import type { DonorSession } from './donor-auth.types';
import { DonorTokenService } from './donor-token.service';
import { generateLoginCode, hashLoginCode, loginCodeMatches } from './login-code';

/** Один текст на все неудачи ввода кода: что именно не так — подсказка подбирающему. */
const WRONG_CODE = 'Код неверный или устарел — запросите новый';

/**
 * Вход в кабинет по коду на e-mail. Паролей нет: жертвователь заходит раз
 * в месяц, и забытый пароль стоил бы больше, чем письмо с кодом.
 */
@Injectable()
export class DonorAuthService {
  private readonly logger = new Logger(DonorAuthService.name);
  private readonly hmacSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: DonorTokenService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    config: ConfigService<AppConfig, true>,
  ) {
    this.hmacSecret = config.get('donor', { infer: true }).hmacSecret;
  }

  /**
   * Выдаёт код. Ответ контроллера одинаков при любом исходе — есть ли такой
   * аккаунт, сработал ли лимит, — иначе форма входа стала бы способом
   * проверить, жертвует ли человек мечети.
   */
  async requestCode(email: string, now: Date = new Date()): Promise<void> {
    if (await this.isRateLimited(email, now)) {
      this.logger.warn('Лимит кодов на адрес исчерпан — письмо не отправлено');

      return;
    }

    const code = generateLoginCode();

    await this.prisma.$transaction([
      // Новый код вытесняет старые: в почте действует только последнее письмо.
      this.prisma.donorAuthCode.updateMany({ where: { email, usedAt: null }, data: { usedAt: now } }),
      this.prisma.donorAuthCode.create({
        data: {
          email,
          codeHash: hashLoginCode(this.hmacSecret, email, code),
          expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MS),
        },
      }),
    ]);

    try {
      await this.mail.send(loginCodeMail(email, code, LOGIN_CODE_TTL_MINUTES));
    } catch (error: unknown) {
      // Ответ всё равно одинаковый; человек запросит код повторно.
      this.logger.error('Письмо с кодом не отправлено', error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Проверка кода: не больше пяти попыток, код одноразовый. Первый вход
   * создаёт аккаунт — регистрации отдельно нет.
   */
  async verify(email: string, code: string, now: Date = new Date()): Promise<DonorSession> {
    const stored = await this.prisma.donorAuthCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, attempts: true },
    });

    if (stored === null || stored.attempts >= MAX_CODE_ATTEMPTS) {
      throw new UnauthorizedException(WRONG_CODE);
    }

    if (!loginCodeMatches(this.hmacSecret, email, code, stored.codeHash)) {
      // Условие на attempts — в самом UPDATE: параллельные неверные вводы
      // не проскочат лимит, прочитав одно и то же значение.
      await this.prisma.donorAuthCode.updateMany({
        where: { id: stored.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });

      throw new UnauthorizedException(WRONG_CODE);
    }

    // Гасим код условным UPDATE: из двух одновременных верных вводов
    // сессию получит ровно один.
    const consumed = await this.prisma.donorAuthCode.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw new UnauthorizedException(WRONG_CODE);
    }

    const existing = await this.prisma.donorUser.findUnique({ where: { email }, select: { id: true } });
    const donor = await this.prisma.donorUser.upsert({
      where: { email },
      create: { email, lastLoginAt: now },
      update: { lastLoginAt: now },
      select: { id: true, email: true, tokenVersion: true },
    });

    return this.issue(donor, existing === null);
  }

  /** Новая пара токенов по refresh-cookie. Отозванная версия — 401. */
  async refresh(refreshToken: string): Promise<DonorSession> {
    const payload = await this.tokens.verify('refresh', refreshToken);
    const donor = await this.prisma.donorUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    });

    if (donor === null || donor.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Сессия истекла или недействительна');
    }

    return this.issue(donor, false);
  }

  /**
   * Выход: версия сессий растёт, и все токены этого человека гаснут.
   * Битая или чужая cookie — просто ничего не делаем: выйти и так вышли.
   */
  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken === null) {
      return;
    }

    try {
      const payload = await this.tokens.verify('refresh', refreshToken);

      await this.prisma.donorUser.updateMany({
        where: { id: payload.sub, tokenVersion: payload.ver },
        data: { tokenVersion: { increment: 1 } },
      });
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }
  }

  private async issue(
    donor: { id: string; email: string; tokenVersion: number },
    isNew: boolean,
  ): Promise<DonorSession> {
    const payload = { sub: donor.id, ver: donor.tokenVersion };
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.sign('access', payload),
      this.tokens.sign('refresh', payload),
    ]);

    return {
      accessToken,
      expiresIn: this.tokens.ttlSeconds('access'),
      refreshToken,
      refreshExpiresAt: new Date(Date.now() + this.tokens.ttlSeconds('refresh') * 1000),
      donor: { id: donor.id, email: donor.email },
      isNew,
    };
  }

  private async isRateLimited(email: string, now: Date): Promise<boolean> {
    const recent = await this.prisma.donorAuthCode.findMany({
      where: { email, createdAt: { gt: new Date(now.getTime() - CODE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
      take: CODE_HOURLY_LIMIT,
    });
    const latest = recent[0];

    return (
      recent.length >= CODE_HOURLY_LIMIT ||
      (latest !== undefined && now.getTime() - latest.createdAt.getTime() < CODE_RESEND_INTERVAL_MS)
    );
  }
}
