/** Жертвователь, вошедший в кабинет. Кладётся в запрос гардом `DonorJwtGuard`. */
export interface DonorPrincipal {
  readonly id: string;
  readonly email: string;
}

/** Запрос в объёме, нужном слою авторизации кабинета. */
export interface DonorRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip?: string;
  donor?: DonorPrincipal;
}

export interface DonorTokenPayload {
  readonly sub: string;
  /** `donor_user.token_version` на момент выдачи. */
  readonly ver: number;
}

export interface DonorSession {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
  readonly donor: DonorPrincipal;
  /** Первый вход — аккаунт только что создан. Фронту — для приветствия. */
  readonly isNew: boolean;
}
