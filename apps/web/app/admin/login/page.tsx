"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/admin/ui/Button";
import { FormErrors, TextField } from "@/components/admin/ui/Field";
import { LoadingState } from "@/components/admin/ui/StateViews";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import { ADMIN_HOME } from "@/lib/admin/navigation";
import { useAdminSession } from "@/lib/admin/session";

import styles from "./login.module.css";

export default function LoginPage() {
  const { state, login } = useAdminSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (state.status === "authenticated") {
      router.replace(ADMIN_HOME);
    }
  }, [state.status, router]);

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

  if (state.status !== "anonymous") {
    return <LoadingState label="Проверяем вход…" />;
  }

  return (
    <main className={styles.page}>
      <form className={`card ${styles.card}`} onSubmit={handleSubmit} noValidate={false}>
        <h1 className={styles.title}>Вход в админку</h1>
        <p className={styles.lead}>Мечеть «Шамиль»</p>
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
        <TextField
          label="Пароль"
          type="password"
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
