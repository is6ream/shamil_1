"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";

import field from "@/components/ui/field.module.css";
import { errorMessage } from "@/lib/admin/errors";
import { DONOR_PATHS, LOGIN_CODE_LENGTH } from "@/lib/donor/endpoints";
import { donorClient, replaceDonorProfile } from "@/lib/donor/session";
import type { DonorProfile } from "@/lib/donor/types";

import styles from "./ProfileSettings.module.css";

type Step =
  | { readonly kind: "view" }
  | { readonly kind: "enter" }
  | { readonly kind: "code"; readonly email: string }
  | { readonly kind: "done" };

/**
 * Почта меняется только кодом, отправленным на **новый** адрес: так адрес
 * в кабинете всегда тот, к которому у человека есть доступ.
 */
export function EmailSection({ profile }: { readonly profile: DonorProfile }) {
  const ids = useId();
  const [step, setStep] = useState<Step>({ kind: "view" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);

    try {
      await task();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const address = email.trim();

    void run(async () => {
      await donorClient().request(DONOR_PATHS.emailRequestCode, { method: "POST", body: { email: address } });
      setCode("");
      setStep({ kind: "code", email: address });
    });
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step.kind !== "code") {
      return;
    }

    void run(async () => {
      const saved = await donorClient().request<DonorProfile>(DONOR_PATHS.emailConfirm, {
        method: "POST",
        body: { email: step.email, code },
      });

      replaceDonorProfile(saved);
      setStep({ kind: "done" });
    });
  }

  const errorView =
    error === null ? null : (
      <p className={field.error} role="alert">
        {error}
      </p>
    );

  return (
    <section className={`card ${styles.section}`} aria-labelledby={`${ids}-title`}>
      <h2 className={styles.heading} id={`${ids}-title`}>
        Электронная почта
      </h2>

      {step.kind === "view" || step.kind === "done" ? (
        <div className={styles.row}>
          <span>{profile.email ?? <span className={styles.muted}>Не указана — на неё приходят коды входа и письма о справке</span>}</span>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStep({ kind: "enter" })}>
            {profile.email === null ? "Указать" : "Изменить"}
          </button>
          {step.kind === "done" ? (
            <p className={styles.muted} role="status">
              Почта изменена.
            </p>
          ) : null}
        </div>
      ) : null}

      {step.kind === "enter" ? (
        <form className={styles.inline} onSubmit={requestCode} noValidate>
          <div>
            <label className={field.label} htmlFor={`${ids}-email`}>
              Новый адрес
            </label>
            <input
              id={`${ids}-email`}
              className={field.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={email.trim() === ""} aria-busy={isBusy}>
            Получить код
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStep({ kind: "view" })}>
            Отмена
          </button>
        </form>
      ) : null}

      {step.kind === "code" ? (
        <form className={styles.inline} onSubmit={confirm} noValidate>
          <div>
            <label className={field.label} htmlFor={`${ids}-code`}>
              Код из письма на {step.email}
            </label>
            <input
              id={`${ids}-code`}
              className={field.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LOGIN_CODE_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, LOGIN_CODE_LENGTH))}
            />
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={code.length !== LOGIN_CODE_LENGTH} aria-busy={isBusy}>
            Подтвердить
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setStep({ kind: "enter" })}>
            Другой адрес
          </button>
        </form>
      ) : null}

      {errorView}
    </section>
  );
}
