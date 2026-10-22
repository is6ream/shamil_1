"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { PasswordInput } from "@/components/admin/ui/PasswordInput";
import { LoadingState } from "@/components/admin/ui/StateViews";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import { safeNextPath } from "@/lib/admin/login";
import { ADMIN_HOME } from "@/lib/admin/navigation";
import { useAdminSession } from "@/lib/admin/session";

import styles from "./login.module.css";

/** `useSearchParams` требует границы Suspense, иначе Next не соберёт страницу. */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState label="Проверяем вход…" />}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const { state, login } = useAdminSession();
  const router = useRouter();
  // Вернуть туда, где была страница до входа, — только внутрь кабинета.
  const next = safeNextPath(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(next);
    }
  }, [state.status, router, next]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrors([]);

    try {
      await login({ email, password });
    } catch (error: unknown) {
      setErrors(error instanceof AdminApiError ? error.messages : [errorMessage(error)]);
      setIsSubmitting(false);
    }
  }

  if (state.status !== "anonymous" && state.status !== "unavailable") {
    return <LoadingState label="Проверяем вход…" />;
  }

  return (
    <main className={styles.page}>
      <form className={`card ${styles.card}`} onSubmit={handleSubmit} noValidate={false}>
        <div className={styles.brand}>
          <Image className={styles.logo} src="/brand/logo.svg" alt="" width={56} height={56} unoptimized priority />
          <div>
            <h1 className={styles.title}>Вход в кабинет</h1>
            <p className={styles.lead}>Мечеть «Шамиль»</p>
          </div>
        </div>
        {next !== ADMIN_HOME ? (
          <p className={styles.notice} role="status">
            Войдите, чтобы продолжить, — после входа вернём на ту же страницу.
          </p>
        ) : null}
        <TextField
          label="Электронная почта"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <PasswordInput
          label="Пароль"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FormErrors messages={errors} />
        <Button type="submit" className={`btn-block ${styles.submit}`} isBusy={isSubmitting}>
          Войти
        </Button>
      </form>
    </main>
  );
}
