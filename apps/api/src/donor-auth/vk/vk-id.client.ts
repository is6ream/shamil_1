import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

/**
 * Вызовы VK ID по «Справочнику методов API VK ID» (сверено 27.10.2026,
 * выжимка — docs/donor-cabinet/vk-id.md). Схема — «без SDK, конфиденциальное
 * приложение»: PKCE генерирует бэкенд, код меняется на токены на бэкенде
 * с `service_token`. Токены VK у себя не храним: нужен только `user_id`
 * и имя, поэтому access token живёт ровно до запроса `user_info`.
 */
export const VK_ID_AUTHORIZE_URL = 'https://id.vk.ru/authorize';
export const VK_ID_TOKEN_URL = 'https://id.vk.ru/oauth2/auth';
export const VK_ID_USER_INFO_URL = 'https://id.vk.ru/oauth2/user_info';

/** VK отвечает за доли секунды; дольше — пусть человек нажмёт ещё раз. */
const HTTP_TIMEOUT_MS = 10_000;

export interface VkAuthorizeParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
}

export interface VkExchangeParams {
  readonly clientId: string;
  readonly serviceToken: string;
  readonly redirectUri: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly deviceId: string;
  readonly state: string;
}

export interface VkUser {
  /** Строка цифр: так её отдаёт VK, так и храним. */
  readonly userId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

/** DI-токен: в тестах подменяется фейком без сети. */
export const VK_ID_CLIENT = Symbol('VK_ID_CLIENT');

export interface VkIdClient {
  authorizeUrl(params: VkAuthorizeParams): string;
  /** Код → access token → данные пользователя. */
  fetchUser(params: VkExchangeParams): Promise<VkUser>;
}

/** Ссылка на форму VK ID. scope не передаём: хватает `vkid.personal_info` по умолчанию. */
export function buildVkAuthorizeUrl(params: VkAuthorizeParams): string {
  const url = new URL(VK_ID_AUTHORIZE_URL);

  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  return url.toString();
}

/** Ответ VK, по которому решаем, что делать дальше. */
function readString(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];

  if (typeof field === 'string' && field.length > 0) {
    return field;
  }

  return typeof field === 'number' && Number.isSafeInteger(field) ? String(field) : null;
}

@Injectable()
export class HttpVkIdClient implements VkIdClient {
  private readonly logger = new Logger(HttpVkIdClient.name);

  authorizeUrl(params: VkAuthorizeParams): string {
    return buildVkAuthorizeUrl(params);
  }

  async fetchUser(params: VkExchangeParams): Promise<VkUser> {
    const tokens = await this.post(VK_ID_TOKEN_URL, {
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      code: params.code,
      client_id: params.clientId,
      device_id: params.deviceId,
      state: params.state,
      service_token: params.serviceToken,
    });
    const accessToken = readString(tokens, 'access_token');

    // VK обязан вернуть тот же state; иначе ответ считается подменённым.
    if (accessToken === null || readString(tokens, 'state') !== params.state) {
      this.logger.warn(`VK ID не выдал токен: ${readString(tokens, 'error') ?? 'неожиданный ответ'}`);
      throw new BadGatewayException('VK ID не подтвердил вход');
    }

    const info = await this.post(VK_ID_USER_INFO_URL, { client_id: params.clientId, access_token: accessToken });
    const user = typeof info === 'object' && info !== null && 'user' in info ? info.user : null;
    const userId = readString(user, 'user_id');

    if (userId === null || !/^[0-9]{1,32}$/.test(userId)) {
      this.logger.warn(`VK ID не отдал пользователя: ${readString(info, 'error') ?? 'неожиданный ответ'}`);
      throw new BadGatewayException('VK ID не подтвердил вход');
    }

    return { userId, firstName: readString(user, 'first_name'), lastName: readString(user, 'last_name') };
  }

  /** Документация: только POST и только `application/x-www-form-urlencoded`. */
  private async post(url: string, body: Record<string, string>): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      this.logger.error(`VK ID недоступен: ${error instanceof Error ? error.message : String(error)}`);
      throw new BadGatewayException('VK ID сейчас недоступен — попробуйте ещё раз или войдите по почте');
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      this.logger.error(`VK ID ответил не JSON, HTTP ${response.status}`);
      throw new BadGatewayException('VK ID сейчас недоступен — попробуйте ещё раз или войдите по почте');
    }
  }
}
