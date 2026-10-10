"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import filterStyles from "@/components/admin/donations/donations.module.css";
import { Button } from "@/components/admin/ui/Button";
import { Pagination } from "@/components/admin/ui/DataTable";
import { SelectField, TextField } from "@/components/admin/ui/Field";
import type { SelectOption } from "@/components/admin/ui/Field";
import { EmptyState, ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import styles from "@/components/admin/users/users.module.css";
import { EMPTY_AUDIT_FILTERS, auditDiff, auditFiltersToParams } from "@/lib/admin/audit";
import type { AuditFilters } from "@/lib/admin/audit";
import { ADMIN_PATHS, LIMITS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { AUDIT_ACTION_GROUPS, AUDIT_ENTITY_LABELS, auditActionLabel, auditEntityLabel } from "@/lib/admin/labels";
import { withQuery } from "@/lib/admin/query";
import { ROLE_LABELS } from "@/lib/admin/roles";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminUserRecord, AuditEntry, Paged } from "@/lib/admin/types";

const ENTITY_OPTIONS: readonly SelectOption[] = Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => ({ value, label }));

function actorText(entry: AuditEntry): string {
  if (entry.actor.type === "system") {
    return `Система (${entry.actor.label ?? "—"})`;
  }

  const role = entry.actor.role ? ` · ${ROLE_LABELS[entry.actor.role]}` : "";

  return `${entry.actor.label ?? "—"}${role}`;
}

function Diff({ entry }: { readonly entry: AuditEntry }) {
  const rows = auditDiff(entry.before, entry.after);

  if (rows.length === 0) {
    return <p className={filterStyles.muted}>Подробностей нет.</p>;
  }

  return (
    <table className={styles.diff}>
      <thead>
        <tr>
          <th scope="col">Поле</th>
          <th scope="col">Было</th>
          <th scope="col">Стало</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field}>
            <td>{row.field}</td>
            <td className={row.before !== null && row.after !== null ? styles.before : undefined}>{row.before ?? "—"}</td>
            <td>{row.after ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Журнал действий (API.md §6) — суперадмин и бухгалтер. */
export default function AuditPage() {
  const { can } = useAdminSession();
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Список пользователей отдаётся только суперадмину; бухгалтер фильтрует без него.
  const users = useAdminQuery<readonly AdminUserRecord[]>(can("users") ? ADMIN_PATHS.users : null);
  const path = withQuery(ADMIN_PATHS.audit, { ...auditFiltersToParams(filters), page, pageSize: LIMITS.pageSize });
  const { data, error, isLoading, reload } = useAdminQuery<Paged<AuditEntry>>(path);
  const periodError = draft.from !== "" && draft.to !== "" && draft.from > draft.to ? "Конец периода раньше начала" : null;

  function set<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (periodError === null) {
      setFilters(draft);
      setPage(1);
    }
  }

  const userOptions: readonly SelectOption[] =
    users.data?.map((user) => ({ value: user.id, label: user.displayName ?? user.email })) ?? [];

  return (
    <AdminPage title="Журнал действий" lead="Кто, когда и что менял в админке. Время — по Уфе. Данные жертвователей скрыты." isWide>
      <form className={filterStyles.filters} onSubmit={handleSubmit} aria-label="Фильтры журнала">
        <div className={filterStyles.filterGrid}>
          <TextField label="С" type="date" value={draft.from} onChange={(event) => set("from", event.target.value)} />
          <TextField
            label="По (включительно)"
            type="date"
            value={draft.to}
            onChange={(event) => set("to", event.target.value)}
            error={periodError}
          />
          {can("users") ? (
            <SelectField
              label="Кто"
              emptyLabel="Все"
              options={userOptions}
              value={draft.actorId}
              onChange={(event) => set("actorId", event.target.value)}
            />
          ) : null}
          <SelectField
            label="Действия"
            emptyLabel="Все"
            options={AUDIT_ACTION_GROUPS}
            value={draft.action}
            onChange={(event) => set("action", event.target.value)}
          />
          <SelectField
            label="Объект"
            emptyLabel="Любой"
            options={ENTITY_OPTIONS}
            value={draft.entityType}
            onChange={(event) => set("entityType", event.target.value)}
          />
        </div>
        <div className={filterStyles.filterActions}>
          <Button type="submit" isSmall disabled={periodError !== null}>
            Показать
          </Button>
          <Button
            variant="ghost"
            isSmall
            onClick={() => {
              setDraft(EMPTY_AUDIT_FILTERS);
              setFilters(EMPTY_AUDIT_FILTERS);
              setPage(1);
            }}
          >
            Сбросить
          </Button>
        </div>
      </form>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data !== null && data.items.length === 0 ? <EmptyState title="Записей нет — измените фильтры." /> : null}
      {data !== null && data.items.length > 0 ? (
        <>
          <ul className={filterStyles.auditList}>
            {data.items.map((entry) => (

                <li key={entry.id} className={filterStyles.auditItem}>
                  <div className={filterStyles.auditHead}>
                    <span className={filterStyles.muted}>{formatDateTime(entry.occurredAt)}</span>
                    <b>{auditActionLabel(entry.action)}</b>
                    <span>{actorText(entry)}</span>
                    <span className={filterStyles.muted}>{auditEntityLabel(entry.entityType)}</span>
                    <button
                      type="button"
                      className={styles.toggle}
                      aria-expanded={expanded === entry.id}
                      onClick={() => setExpanded((current) => (current === entry.id ? null : entry.id))}
                    >
                      {expanded === entry.id ? "Скрыть" : "Подробнее"}
                    </button>
                  </div>
                  {expanded === entry.id ? <Diff entry={entry} /> : null}
                </li>

            ))}
          </ul>
          <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
        </>
      ) : null}
    </AdminPage>
  );
}
