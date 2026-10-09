"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { createAdminClient } from "@/lib/admin/api-client";
import type { AdminClient } from "@/lib/admin/api-client";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import { loginRequest } from "@/lib/admin/login";
import { ADMIN_HOME } from "@/lib/admin/navigation";
import { API_URL } from "@/lib/site";

import styles from "./LoginDialog.module.css";

interface LoginDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * Вход для сотрудников из шапки публичного сайта (D-F11).
 *
 * `AdminSessionProvider` на публичных страницах сознательно не стоит: он
 * делает refresh при каждой загрузке, а это лишний запрос от каждого
 * посетителя и админский код в бандле главной. Поэтому окно только
 * получает refresh-cookie (её ставит API) и уводит в `/admin`, где провайдер
 * сам восстановит сессию через refresh + `/me`. Access-токен из ответа здесь
 * не сохраняется. Цена — один лишний refresh сразу после входа.
 *
 * Компонент грузится лениво (`next/dynamic` в `SiteHeader`) по первому клику.
 */
export function LoginDialog({ isOpen, onClose }: LoginDialogProps) {
  const [client] = useState(() => createAdminClient({ baseUrl: API_URL }));

  return (
    <Modal isOpen={isOpen} title="Вход для сотрудников" onClose={onClose} isDismissible>
      <LoginForm client={client} />
    </Modal>
  );
}

function formText(data: FormData, name: string): string {
  const value = data.get(name);

  return typeof value === "string" ? value : "";
}

/**
 * Поля неуправляемые: пароль не живёт в state React, значения читаются
 * из формы только в момент отправки.
 *
 * Тело живёт, только пока окно открыто: после закрытия форма пустая.
 */
function LoginForm({ client }: { readonly client: AdminClient }) {
  const router = useRouter();
  const isSubmittingRef = useRef(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Ref, а не state: двойной Enter успевает раньше перерисовки.
    if (isSubmittingRef.current) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const passwordInput = form.elements.namedItem("password");

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrors([]);

    try {
      await loginRequest(client, { email: formText(data, "email"), password: formText(data, "password") });
      // Кнопка остаётся «занятой» до ухода со страницы.
      router.push(ADMIN_HOME);
    } catch (error: unknown) {
      isSubmittingRef.current = false;
      setErrors(error instanceof AdminApiError ? error.messages : [errorMessage(error)]);
      setIsSubmitting(false);

      if (passwordInput instanceof HTMLInputElement) {
        passwordInput.value = "";
        // Поля были disabled, и фокус с них слетел; возвращаем его на пароль
        // после перерисовки, иначе он уйдёт из окна.
        requestAnimationFrame(() => passwordInput.focus());
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.lead}>Мечеть «Шамиль»</p>
      <fieldset className={styles.fields} disabled={isSubmitting}>
        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          data-autofocus
        />
        <TextField
          label="Пароль"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </fieldset>
      <FormErrors messages={errors} />
      <Button type="submit" className={`btn-block ${styles.submit}`} isBusy={isSubmitting}>
        Войти
      </Button>
      <p className={styles.already}>
        Уже вошли? <Link href={ADMIN_HOME}>Открыть админку</Link>
      </p>
    </form>
  );
}
