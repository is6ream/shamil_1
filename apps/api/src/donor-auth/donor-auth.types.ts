/** Жертвователь, вошедший в кабинет. Кладётся в запрос гардом `DonorJwtGuard`. */
export interface DonorPrincipal {
  readonly id: string;
  /** Сессия этого устройства: выход гасит именно её. */
  readonly sessionId: string;
  /** Пуст у вошедшего через VK, пока он не подтвердил почту. */
  readonly email: string | null;
}

/** Запрос в объёме, нужном слою авторизации кабинета. */
export interface DonorRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip?: string;
  donor?: DonorPrincipal;
}

export interface DonorTokenPayload {
  readonly sub: string;
  /** `donor_session.id`: гард проверяет, что сессия жива. */
  readonly sid: string;
}

/** Откуда пришёл запрос — пишется в сессию и в коды. */
export interface DonorRequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface DonorSession {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly donor: { readonly id: string; readonly email: string | null };
  /** Первый вход — аккаунт только что создан. Фронту — для приветствия. */
  readonly isNew: boolean;
}
