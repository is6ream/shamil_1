/**
 * Коды ошибок Prisma и PostgreSQL, на которые сервисы отвечают осмысленно,
 * а не 500. Сравнение по коду, а не по классу: под драйвер-адаптером часть
 * ошибок приходит без класса Prisma.
 */

/** Нарушение уникального индекса. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/** Нарушение внешнего ключа. */
const PRISMA_FOREIGN_KEY_VIOLATION = 'P2003';

/** Запись для update/delete не найдена. */
const PRISMA_RECORD_NOT_FOUND = 'P2025';

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, PRISMA_UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, PRISMA_FOREIGN_KEY_VIOLATION);
}

export function isRecordNotFound(error: unknown): boolean {
  return hasCode(error, PRISMA_RECORD_NOT_FOUND);
}

/**
 * Нарушение EXCLUDE-ограничения PostgreSQL (23P01) — пересечение периодов
 * цели месяца. Prisma отдаёт его как неизвестную ошибку БД; код ищем в тексте.
 */
export function isExclusionViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const text = 'message' in error && typeof error.message === 'string' ? error.message : '';

  return text.includes('23P01') || text.includes('campaign_monthly_goal_no_overlap');
}
