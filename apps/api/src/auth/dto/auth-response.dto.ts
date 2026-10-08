import type { AdminRole } from '../../generated/prisma/enums';
import type { AdminPrincipal, IssuedSession } from '../auth.types';

export interface AdminMeResponse {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly displayName: string | null;
}

/**
 * Ответ входа и обновления сессии. Refresh-токена в теле нет — он только
 * в httpOnly-cookie. Access-токен клиент держит в памяти вкладки.
 */
export interface SessionResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  /** Секунды до истечения access-токена. */
  readonly expiresIn: number;
  readonly user: AdminMeResponse;
}

export function toMeResponse(admin: AdminPrincipal): AdminMeResponse {
  return { id: admin.id, email: admin.email, role: admin.role, displayName: admin.displayName };
}

export function toSessionResponse(session: IssuedSession): SessionResponse {
  return {
    accessToken: session.accessToken,
    tokenType: 'Bearer',
    expiresIn: session.expiresIn,
    user: toMeResponse(session.user),
  };
}
