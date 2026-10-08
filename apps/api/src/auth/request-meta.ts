import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { USER_AGENT_MAX_LENGTH } from './auth.constants';
import type { AuthRequest, RequestMeta } from './auth.types';

/** IP и user-agent запроса. `req.ip` уже учитывает `trust proxy` (bootstrap.ts). */
export function readRequestMeta(request: AuthRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];

  return {
    ip: typeof request.ip === 'string' && request.ip.length > 0 ? normalizeIp(request.ip) : null,
    userAgent:
      typeof userAgent === 'string' && userAgent.length > 0
        ? userAgent.slice(0, USER_AGENT_MAX_LENGTH)
        : null,
  };
}

/** `::ffff:127.0.0.1` → `127.0.0.1`: так IPv4 за двухстековым сокетом читается человеком. */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

/** `@ReqMeta() meta: RequestMeta` в параметрах обработчика. */
export const ReqMeta = createParamDecorator((_data: unknown, context: ExecutionContext): RequestMeta =>
  readRequestMeta(context.switchToHttp().getRequest<AuthRequest>()),
);
