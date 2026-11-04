import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig, VkIdConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { PD_CONSENT_VERSION } from '../donor-auth.constants';
import type { DonorRequestMeta, DonorSession } from '../donor-auth.types';
import { DonorSessionService } from '../donor-session.service';
import { VK_ID_CLIENT } from './vk-id.client';
import type { VkIdClient, VkUser } from './vk-id.client';

/** Столько живёт код VK — и столько ждём возврата человека из VK. */
export const VK_STATE_TTL_MS = 10 * 60_000;

/** state ≥ 32 символов из `a-zA-Z0-9_-`: 32 байта в base64url дают 43. */
const STATE_BYTES = 32;
/** code_verifier — 43…128 символов того же алфавита: 64 байта дают 86. */
const VERIFIER_BYTES = 64;

const DEFAULT_RETURN_TO = '/profile';
const RETURN_TO_MAX_LENGTH = 512;

const VK_DISABLED = 'Вход через VK не настроен';
const VK_FAILED = 'Вход через VK не удался — попробуйте ещё раз';

export type VkPurpose = 'login' | 'link';

export interface VkStart {
  readonly url: string;
  /** Уходит и в URL, и в httpOnly-cookie: в колбэке они должны совпасть. */
  readonly state: string;
}

export interface VkCallbackInput {
  readonly code: string;
  readonly state: string;
  readonly deviceId: string;
  /** state из cookie браузера, начавшего вход. */
  readonly cookieState: string | null;
}

export type VkCallbackResult =
  | { readonly purpose: 'login'; readonly session: DonorSession; readonly returnTo: string }
  | { readonly purpose: 'link'; readonly returnTo: string };

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Только путь своего сайта: `//evil.example` и `/\evil.example` браузер
 * читает как чужой домен, а открытый редирект после «войдите через VK» —
 * готовая фишинговая ссылка. То же правило — CHECK в базе.
 */
export function safeReturnTo(value: string | undefined): string {
  if (value === undefined || value.length > RETURN_TO_MAX_LENGTH || !/^\/(?![/\\])/.test(value)) {
    return DEFAULT_RETURN_TO;
  }

  return value;
}

/**
 * Вход и привязка через VK ID без SDK, с обменом кода на бэкенде.
 *
 * State привязан к браузеру: он лежит в httpOnly-cookie и должен совпасть
 * с тем, что вернул VK. Без этого злоумышленник мог бы подсунуть жертве
 * ссылку с колбэком своего входа, и жертва оказалась бы в его кабинете
 * (login CSRF) — а дальше жертвовала бы «под его именем».
 *
 * E-mail из VK логином не становится: VK не подтверждает нам владение
 * адресом. Почту человек добавляет сам, кодом, в настройках.
 */
@Injectable()
export class VkAuthService {
  private readonly vk: VkIdConfig | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: DonorSessionService,
    @Inject(VK_ID_CLIENT) private readonly client: VkIdClient,
    config: ConfigService<AppConfig, true>,
  ) {
    this.vk = config.get('donor', { infer: true }).vk;
  }

  get isEnabled(): boolean {
    return this.vk !== null;
  }

  async start(purpose: VkPurpose, donorId: string | null, returnTo: string | undefined, now: Date = new Date()): Promise<VkStart> {
    const vk = this.requireConfig();
    const state = randomBytes(STATE_BYTES).toString('base64url');
    const codeVerifier = randomBytes(VERIFIER_BYTES).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');

    await this.prisma.donorOauthState.create({
      data: {
        stateHash: sha256Hex(state),
        codeVerifier,
        purpose,
        donorId: purpose === 'link' ? donorId : null,
        returnTo: safeReturnTo(returnTo),
        expiresAt: new Date(now.getTime() + VK_STATE_TTL_MS),
      },
    });

    return {
      url: this.client.authorizeUrl({ clientId: vk.clientId, redirectUri: vk.redirectUri, state, codeChallenge }),
      state,
    };
  }

  async callback(input: VkCallbackInput, meta: DonorRequestMeta, now: Date = new Date()): Promise<VkCallbackResult> {
    const vk = this.requireConfig();

    if (input.cookieState === null || !sameString(input.cookieState, input.state)) {
      throw new UnauthorizedException(VK_FAILED);
    }

    const stored = await this.prisma.donorOauthState.findUnique({
      where: { stateHash: sha256Hex(input.state) },
      select: { id: true, codeVerifier: true, purpose: true, donorId: true, returnTo: true, expiresAt: true, usedAt: true },
    });

    if (stored === null || stored.usedAt !== null || stored.expiresAt <= now) {
      throw new UnauthorizedException(VK_FAILED);
    }

    // Одноразовость — условным UPDATE: повторный заход по той же ссылке
    // из истории браузера второй сессии не даст.
    const consumed = await this.prisma.donorOauthState.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw new UnauthorizedException(VK_FAILED);
    }

    const user = await this.client.fetchUser({
      clientId: vk.clientId,
      serviceToken: vk.serviceToken,
      redirectUri: vk.redirectUri,
      code: input.code,
      codeVerifier: stored.codeVerifier,
      deviceId: input.deviceId,
      state: input.state,
    });

    if (stored.purpose === 'link' && stored.donorId !== null) {
      await this.link(stored.donorId, user);

      return { purpose: 'link', returnTo: stored.returnTo };
    }

    return { purpose: 'login', session: await this.login(user, meta, now), returnTo: stored.returnTo };
  }

  private async login(user: VkUser, meta: DonorRequestMeta, now: Date): Promise<DonorSession> {
    const existing = await this.prisma.donorUser.findUnique({
      where: { vkUserId: user.userId },
      select: { id: true, email: true, pdConsentVersion: true },
    });
    // Согласие отмечено в окне входа за секунды до перехода в VK — без
    // галочки кнопка VK неактивна так же, как кнопка кода.
    const consent = { pdConsentAt: now, pdConsentVersion: PD_CONSENT_VERSION };

    if (existing !== null) {
      await this.prisma.donorUser.update({
        where: { id: existing.id },
        data: { lastLoginAt: now, ...(existing.pdConsentVersion === PD_CONSENT_VERSION ? {} : consent) },
      });

      return this.sessions.open(existing, meta, false, now);
    }

    const created = await this.prisma.donorUser.create({
      data: {
        vkUserId: user.userId,
        // Имя из VK — только как стартовое значение, человек поправит в настройках.
        firstName: user.firstName?.slice(0, 60) ?? null,
        lastName: user.lastName?.slice(0, 60) ?? null,
        lastLoginAt: now,
        ...consent,
      },
      select: { id: true, email: true },
    });

    return this.sessions.open(created, meta, true, now);
  }

  /** Привязка VK к уже вошедшему. Чужой VK не перехватываем — 409. */
  private async link(donorId: string, user: VkUser): Promise<void> {
    const owner = await this.prisma.donorUser.findUnique({ where: { vkUserId: user.userId }, select: { id: true } });

    if (owner !== null && owner.id !== donorId) {
      throw new ConflictException('Этот профиль VK уже привязан к другому кабинету');
    }

    const updated = await this.prisma.donorUser.updateMany({
      where: { id: donorId, deletedAt: null },
      data: { vkUserId: user.userId },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Кабинет не найден');
    }
  }

  private requireConfig(): VkIdConfig {
    if (this.vk === null) {
      throw new NotFoundException(VK_DISABLED);
    }

    return this.vk;
  }
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}
