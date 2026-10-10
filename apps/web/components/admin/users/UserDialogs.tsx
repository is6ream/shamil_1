"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { CheckboxField, FormErrors, SelectField, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import { passwordProblem } from "@/lib/admin/password";
import { ADMIN_ROLES, ROLE_LABELS } from "@/lib/admin/roles";
import type { AdminRole } from "@/lib/admin/roles";
import type { AdminUserRecord, CreateUserBody, UpdateUserBody } from "@/lib/admin/types";

import { PasswordField } from "./PasswordField";
import styles from "./users.module.css";

const ROLE_OPTIONS = ADMIN_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export const ROLE_HINTS: Readonly<Record<AdminRole, string>> = {
  SUPER_ADMIN: "Всё, включая пользователей и реквизиты счёта.",
  EDITOR: "Тексты, стройка, новости, фото, цели; пожертвования без данных жертвователей.",
  ACCOUNTANT: "Пожертвования с данными для сверки, CSV, журнал; без контента.",
};

const DISPLAY_NAME_MAX = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createUser(client: AdminClient, body: CreateUserBody): Promise<AdminUserRecord> {
  return client.request<AdminUserRecord>(ADMIN_PATHS.users, { method: "POST", body });
}

interface UpdateArgs {
  readonly id: string;
  readonly body: UpdateUserBody;
}

function updateUser(client: AdminClient, { id, body }: UpdateArgs): Promise<AdminUserRecord> {
  return client.request<AdminUserRecord>(ADMIN_PATHS.user(id), { method: "PATCH", body });
}

interface ResetArgs {
  readonly id: string;
  readonly newPassword: string;
}

function resetPassword(client: AdminClient, { id, newPassword }: ResetArgs): Promise<null> {
  return client.request<null>(ADMIN_PATHS.userResetPassword(id), { method: "POST", body: { newPassword } });
}

/* ── Новый пользователь ──────────────────────────────────────────────── */

export function CreateUserDialog({ isOpen, onClose, onSaved }: { readonly isOpen: boolean; readonly onClose: () => void; readonly onSaved: () => void }) {
  return (
    <Modal isOpen={isOpen} title="Новый пользователь" onClose={onClose}>
      <CreateForm onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function CreateForm({ onClose, onSaved }: { readonly onClose: () => void; readonly onSaved: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminRole>("EDITOR");
  const [password, setPassword] = useState("");
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(createUser);
  const emailError = EMAIL_PATTERN.test(email.trim()) ? null : "Проверьте адрес почты.";
  const passwordError = passwordProblem(password);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (emailError !== null || passwordError !== null) {
      return;
    }

    const created = await mutation.run({
      email: email.trim().toLowerCase(),
      password,
      role,
      ...(displayName.trim() === "" ? {} : { displayName: displayName.trim() }),
    });

    if (created !== undefined) {
      toast.success(`Пользователь ${created.email} создан. Передайте ему пароль лично.`);
      onSaved();
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <TextField
        label="Электронная почта"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={isTouched ? emailError : null}
        data-autofocus
      />
      <TextField label="Имя (необязательно)" value={displayName} maxLength={DISPLAY_NAME_MAX} onChange={(event) => setDisplayName(event.target.value)} />
      <SelectField
        label="Роль"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(event) => setRole(event.target.value as AdminRole)}
        hint={ROLE_HINTS[role]}
      />
      <PasswordField label="Пароль" value={password} onChange={setPassword} error={isTouched ? passwordError : null} />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Создать
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}

/* ── Изменить пользователя ───────────────────────────────────────────── */

interface EditProps {
  readonly user: AdminUserRecord | null;
  readonly isSelf: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function EditUserDialog({ user, isSelf, onClose, onSaved }: EditProps) {
  return (
    <Modal isOpen={user !== null} title="Пользователь" onClose={onClose}>
      {user ? <EditForm user={user} isSelf={isSelf} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function EditForm({ user, isSelf, onClose, onSaved }: Omit<EditProps, "user"> & { readonly user: AdminUserRecord }) {
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [role, setRole] = useState<AdminRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const mutation = useAdminMutation(updateUser);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = displayName.trim() === "" ? null : displayName.trim();
    // Только изменившиеся поля; свои роль и активность API не примет (400).
    const body: UpdateUserBody = {
      ...(name !== user.displayName ? { displayName: name } : {}),
      ...(!isSelf && role !== user.role ? { role } : {}),
      ...(!isSelf && isActive !== user.isActive ? { isActive } : {}),
    };

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    if ((await mutation.run({ id: user.id, body })) !== undefined) {
      toast.success("Сохранено.");
      onSaved();
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p className={styles.email}>{user.email}</p>
      <TextField label="Имя" value={displayName} maxLength={DISPLAY_NAME_MAX} onChange={(event) => setDisplayName(event.target.value)} />
      <SelectField
        label="Роль"
        options={ROLE_OPTIONS}
        value={role}
        disabled={isSelf}
        onChange={(event) => setRole(event.target.value as AdminRole)}
        hint={isSelf ? "Свою роль менять нельзя — попросите другого суперадмина." : ROLE_HINTS[role]}
      />
      <CheckboxField
        label="Может входить в админку"
        checked={isActive}
        disabled={isSelf}
        onChange={(event) => setIsActive(event.target.checked)}
        hint={isSelf ? "Себя отключить нельзя." : "Снимите, чтобы закрыть доступ. Все его сессии закроются сразу."}
      />
      {!isSelf && (role !== user.role || isActive !== user.isActive) ? (
        <Note tone="warning">
          <p>Человек сразу выйдет из админки на всех устройствах и войдёт заново уже с новыми правами.</p>
        </Note>
      ) : null}
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}

/* ── Сброс пароля ────────────────────────────────────────────────────── */

export function ResetPasswordDialog({ user, onClose, onSaved }: Omit<EditProps, "isSelf">) {
  return (
    <Modal isOpen={user !== null} title="Новый пароль" onClose={onClose}>
      {user ? <ResetForm user={user} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function ResetForm({ user, onClose, onSaved }: Omit<EditProps, "user" | "isSelf"> & { readonly user: AdminUserRecord }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(resetPassword);
  const error = passwordProblem(password);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (error !== null) {
      return;
    }

    if ((await mutation.run({ id: user.id, newPassword: password })) !== undefined) {
      toast.success(`Пароль ${user.email} изменён, блокировка входа снята.`);
      onSaved();
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <p className={styles.email}>{user.email}</p>
      <Note>
        <p>Старый пароль перестанет работать, человек выйдет со всех устройств. Блокировка после неудачных входов снимется.</p>
      </Note>
      <PasswordField label="Новый пароль" value={password} onChange={setPassword} error={isTouched ? error : null} />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Задать пароль
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}
