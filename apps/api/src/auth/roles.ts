import { AdminRole } from '../generated/prisma/enums';

/**
 * Матрица прав D-06 — единственное место, где она записана в коде.
 * Контроллеры ссылаются на эти списки, а не перечисляют роли сами:
 * иначе правка матрицы превращается в поиск по всему проекту.
 *
 * | Действие                                   | SUPER_ADMIN | EDITOR | ACCOUNTANT |
 * | Контент, этапы, новости, медиа, видео      | да          | да     | нет        |
 * | Реквизиты счёта (D-17)                     | да          | нет    | нет        |
 * | Цель сбора и цель месяца                   | да          | да     | нет        |
 * | Ручное поступление, подтверждение перевода | да          | да     | да         |
 * | Список пожертвований, дашборд              | да          | да     | да         |
 * | ПДн жертвователей                          | да          | маска  | да         |
 * | Экспорт CSV                                | да          | нет    | да         |
 * | Журнал действий                            | да          | нет    | да         |
 * | Пользователи админки                       | да          | нет    | нет        |
 */
export const ALL_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.EDITOR,
  AdminRole.ACCOUNTANT,
];

export const CONTENT_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.EDITOR];

/**
 * Реквизиты расчётного счёта — куда уходят деньги жертвователей. Подмена номера
 * счёта из угнанной учётки редактора — прямой увод пожертвований, поэтому
 * правит их только суперадмин (D-17, [проверить]).
 */
export const REQUISITES_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN];

export const GOAL_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.EDITOR];

export const DONATION_WRITE_ROLES: readonly AdminRole[] = ALL_ROLES;

export const DONATION_READ_ROLES: readonly AdminRole[] = ALL_ROLES;

/** Роли, которым ПДн жертвователей показываются без маски. */
export const PII_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNTANT];

export const EXPORT_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNTANT];

export const AUDIT_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ACCOUNTANT];

export const USERS_ROLES: readonly AdminRole[] = [AdminRole.SUPER_ADMIN];

export function canSeePersonalData(role: AdminRole): boolean {
  return PII_ROLES.includes(role);
}
