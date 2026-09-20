import { NodeEnv, validateEnv } from './env.validation';

export interface HttpConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
}

export interface DatabaseConfig {
  readonly url: string;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly http: HttpConfig;
  readonly database: DatabaseConfig;
  readonly throttle: ThrottleConfig;
}

function parseOrigins(value: string): readonly string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Единственное место, где читается `process.env`.
 * Остальной код берёт значения из ConfigService — типизированно и уже проверенными.
 */
export function configuration(): AppConfig {
  const env = validateEnv(process.env as Record<string, unknown>);

  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === NodeEnv.Production,
    http: {
      port: env.API_PORT,
      corsOrigins: parseOrigins(env.CORS_ORIGINS),
    },
    database: {
      url: env.DATABASE_URL,
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS,
      limit: env.THROTTLE_LIMIT,
    },
  };
}
