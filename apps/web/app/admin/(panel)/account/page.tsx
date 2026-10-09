"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import pageStyles from "@/components/admin/AdminPage.module.css";
import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import { AUTH_PATHS, PASSWORD_MIN_LENGTH, parseAccessToken } from "@/lib/admin/endpoints";
import type { ChangePasswordBody } from "@/lib/admin/endpoints";
import { useAdminMutation, useUnsavedChangesWarning } from "@/lib/admin/hooks";

import { validatePasswordChange } from "./validate";

/**
 * API гасит все прочие сессии и выдаёт этой новую: старый access-токен
 * с этого момента не принимается, поэтому сразу берём новый из ответа.
 */
async function changePassword(client: AdminClient, body: ChangePasswordBody): Promise<true> {
  const session = await client.request<unknown>(AUTH_PATHS.changePassword, { method: "PATCH", body });

  client.setAccessToken(parseAccessToken(session));
  return true;
}

export default function AccountPage() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(changePassword);
  const fieldErrors = isTouched ? validatePasswordChange({ current, next, repeat }) : {};

  useUnsavedChangesWarning(current !== "" || next !== "" || repeat !== "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (Object.keys(validatePasswordChange({ current, next, repeat })).length > 0) {
      return;
    }

    const result = await mutation.run({ currentPassword: current, newPassword: next });

    if (result !== undefined) {
      setCurrent("");
      setNext("");
      setRepeat("");
      setIsTouched(false);
      toast.success("Пароль изменён.");
    }
  }

  return (
    <AdminPage title="Сменить пароль" lead="После смены пароля другие ваши устройства выйдут из админки.">
      <form className={`card ${pageStyles.form}`} onSubmit={handleSubmit}>
        <TextField
          label="Текущий пароль"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={fieldErrors.current}
        />
        <TextField
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          hint={`Не короче ${PASSWORD_MIN_LENGTH} символов.`}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          error={fieldErrors.next}
        />
        <TextField
          label="Новый пароль ещё раз"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={fieldErrors.repeat}
        />
        <FormErrors messages={mutation.errors} />
        <Button type="submit" className={`btn-block ${pageStyles.submit}`} isBusy={mutation.isPending}>
          Сохранить пароль
        </Button>
      </form>
    </AdminPage>
  );
}
