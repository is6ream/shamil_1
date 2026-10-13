"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { DataTable } from "@/components/admin/ui/DataTable";
import type { Column } from "@/components/admin/ui/DataTable";
import { ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog } from "@/components/admin/users/UserDialogs";
import styles from "@/components/admin/users/users.module.css";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { ROLE_LABELS } from "@/lib/admin/roles";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminUserRecord } from "@/lib/admin/types";

export default function UsersPage() {
  const { state } = useAdminSession();
  const selfId = state.status === "authenticated" ? state.user.id : null;
  const { data, error, isLoading, reload } = useAdminQuery<readonly AdminUserRecord[]>(ADMIN_PATHS.users);
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [resetting, setResetting] = useState<AdminUserRecord | null>(null);
  // Блокировка входа сравнивается с моментом загрузки списка, а не с «сейчас» на каждом рендере.
  const [loadedAt] = useState(() => Date.now());

  function done() {
    setIsCreating(false);
    setEditing(null);
    setResetting(null);
    reload();
  }

  const columns: readonly Column<AdminUserRecord>[] = [
    {
      key: "user",
      header: "Пользователь",
      render: (row) => (
        <span className={styles.stacked}>
          {row.displayName ?? row.email}
          {row.displayName ? <small>{row.email}</small> : null}
          {row.id === selfId ? <small>это вы</small> : null}
        </span>
      ),
    },
    { key: "role", header: "Роль", render: (row) => ROLE_LABELS[row.role] },
    {
      key: "state",
      header: "Доступ",
      render: (row) => {
        if (!row.isActive) {
          return <Badge>Отключён</Badge>;
        }

        if (row.lockedUntil !== null && Date.parse(row.lockedUntil) > loadedAt) {
          return <Badge tone="warning">Вход заблокирован до {formatDateTime(row.lockedUntil)}</Badge>;
        }

        return <Badge tone="success">Активен</Badge>;
      },
    },
    { key: "login", header: "Последний вход", render: (row) => formatDateTime(row.lastLoginAt) },
    {
      key: "actions",
      header: "Действия",
      render: (row) => (
        <span className={styles.actions}>
          <Button variant="ghost" isSmall onClick={() => setEditing(row)}>
            Изменить
          </Button>
          <Button variant="ghost" isSmall onClick={() => setResetting(row)}>
            Новый пароль
          </Button>
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Пользователи"
      lead="Кто входит в админку. Роли: Суперадмин — всё; Редактор — сайт и стройка; Бухгалтер — пожертвования и журнал."
      actions={<Button onClick={() => setIsCreating(true)}>Добавить пользователя</Button>}
      isWide
    >
      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? <DataTable caption="Пользователи админки" columns={columns} rows={data} rowKey={(row) => row.id} /> : null}

      <CreateUserDialog isOpen={isCreating} onClose={() => setIsCreating(false)} onSaved={done} />
      <EditUserDialog user={editing} isSelf={editing?.id === selfId} onClose={() => setEditing(null)} onSaved={done} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={done} />
    </AdminPage>
  );
}
