import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

import {
  DEFAULT_API_PORT,
  DEFAULT_THROTTLE_LIMIT,
  DEFAULT_THROTTLE_TTL_MS,
} from './constants';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Схема переменных окружения. Приложение не поднимется, пока она не сойдётся:
 * лучше упасть на старте, чем принимать платежи с половиной конфига.
 */
export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  API_PORT: number = DEFAULT_API_PORT;

  /** Строка подключения к PostgreSQL. Секрет — только через окружение. */
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  /** Разрешённые Origin через запятую: фронтенд ходит с другого порта/домена. */
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:3000';

  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS: number = DEFAULT_THROTTLE_TTL_MS;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = DEFAULT_THROTTLE_LIMIT;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const parsed = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n  ');

    throw new Error(`Некорректные переменные окружения:\n  ${details}`);
  }

  return parsed;
}
