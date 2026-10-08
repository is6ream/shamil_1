import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AdminRole } from '../generated/prisma/enums';
import type { SnapshotOptions } from './audit-snapshot';

/** Кто совершил действие. Системный актор — вебхук, статический токен, сид. */
export type AuditActor =
  | { readonly type: 'user'; readonly id: string; readonly role: AdminRole; readonly label: string }
  | { readonly type: 'system'; readonly label: string };

export interface AuditEntry {
  readonly actor: AuditActor;
  /** `<сущность>.<глагол>`: `donation.manual_create`, `content.update`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  /** Состояние до. Для правки в журнал уйдут только изменившиеся поля. */
  readonly before?: unknown;
  readonly after?: unknown;
  readonly meta?: RequestMeta;
  readonly snapshot?: SnapshotOptions;
}

export function userActor(admin: AdminPrincipal): AuditActor {
  return { type: 'user', id: admin.id, role: admin.role, label: admin.email };
}

/** Подпись системного актора для статического `ADMIN_API_TOKEN` (D-07). */
export const API_TOKEN_ACTOR: AuditActor = { type: 'system', label: 'ADMIN_API_TOKEN' };
