import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { PD_CONSENT_VERSION } from './donor-auth.constants';
import type { DonorRequestMeta, DonorSession } from './donor-auth.types';
import { DonorCodeService } from './donor-code.service';
import { DonorSessionService } from './donor-session.service';

/**
 * Вход в кабинет по коду на e-mail. Паролей нет: жертвователь заходит раз
 * в месяц, и забытый пароль стоил бы больше, чем письмо с кодом.
 * Вход через VK ID — `VkAuthService`; сессии у обоих путей общие.
 */
@Injectable()
export class DonorAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: DonorCodeService,
    private readonly sessions: DonorSessionService,
  ) {}

  /** Ответ контроллера одинаков при любом исходе: см. `DonorCodeService.issue`. */
  requestCode(email: string, meta: DonorRequestMeta, now: Date = new Date()): Promise<void> {
    return this.codes.issue({ purpose: 'login', email, donorId: null }, meta.ip, now);
  }

  /**
   * Верный код — сессия. Первый вход создаёт аккаунт: регистрации отдельно
   * нет. Согласие на обработку ПДн (галочка в окне входа, без неё кнопка
   * неактивна) пишется с версией текста; при смене версии — перезаписывается.
   */
  async verify(email: string, code: string, meta: DonorRequestMeta, now: Date = new Date()): Promise<DonorSession> {
    await this.codes.consume({ purpose: 'login', email, donorId: null }, code, now);

    const existing = await this.prisma.donorUser.findUnique({
      where: { email },
      select: { id: true, pdConsentVersion: true },
    });
    const consent = { pdConsentAt: now, pdConsentVersion: PD_CONSENT_VERSION };
    const donor =
      existing === null
        ? await this.prisma.donorUser.create({
            data: { email, lastLoginAt: now, ...consent },
            select: { id: true, email: true },
          })
        : await this.prisma.donorUser.update({
            where: { id: existing.id },
            data: { lastLoginAt: now, ...(existing.pdConsentVersion === PD_CONSENT_VERSION ? {} : consent) },
            select: { id: true, email: true },
          });

    return this.sessions.open(donor, meta, existing === null, now);
  }

  refresh(refreshToken: string, meta: DonorRequestMeta): Promise<DonorSession> {
    return this.sessions.rotate(refreshToken, meta);
  }

  /** Выход только с этого устройства: гаснет его сессия, остальные живут. */
  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken !== null) {
      await this.sessions.revokeByToken(refreshToken);
    }
  }
}
