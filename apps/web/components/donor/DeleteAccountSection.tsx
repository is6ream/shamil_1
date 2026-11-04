"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FormEvent } from "react";

import { Modal } from "@/components/admin/ui/Modal";
import field from "@/components/ui/field.module.css";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import { DONOR_AUTH_PATHS, DONOR_PATHS, LOGIN_CODE_LENGTH, PROFILE_PATHS } from "@/lib/donor/endpoints";
import { donorClient, forgetDonorSession } from "@/lib/donor/session";
import type { DeleteChallenge, DonorProfile } from "@/lib/donor/types";

import styles from "./ProfileSettings.module.css";

type Step =
  | { readonly kind: "closed" }
  | { readonly kind: "confirm" }
  | { readonly kind: "code" }
  /** Почты нет, вход через VK был давно — нужен свежий вход. */
  | { readonly kind: "relogin" };

/**
 * Удаление = обезличивание: ФИО, почта, телефон, регион стираются, сессии
 * отзываются, активные подписки отменяются. Пожертвования остаются для
 * бухгалтерского учёта, но без привязки к человеку.
 */
export function DeleteAccountSection({ profile }: { readonly profile: DonorProfile }) {
  const ids = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  function close() {
    setStep({ kind: "closed" });
    setCode("");
    setError(null);
  }

  async function finish(withCode: string | undefined) {
    await donorClient().request(DONOR_PATHS.delete, {
      method: "POST",
      body: withCode === undefined ? {} : { code: withCode },
    });
    forgetDonorSession();
    router.push("/");
  }

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const challenge = await donorClient().request<DeleteChallenge>(DONOR_PATHS.deleteRequest, { method: "POST" });

      if (challenge.method === "email") {
        setStep({ kind: "code" });
        return;
      }

      await finish(undefined);
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 403) {
        setStep({ kind: "relogin" });
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await finish(code);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function reloginWithVk() {
    setBusy(true);

    try {
      const { url } = await donorClient().request<{ url: string }>(DONOR_AUTH_PATHS.vkStart, {
        method: "POST",
        body: { pdConsent: true, returnTo: PROFILE_PATHS.settings },
        skipAuthRetry: true,
      });

      window.location.assign(url);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <section className={`card ${styles.section} ${styles.danger}`} aria-labelledby={`${ids}-title`}>
      <h2 className={styles.heading} id={`${ids}-title`}>
        Удалить аккаунт
      </h2>
      <p className={styles.muted}>
        Имя, почта, телефон и регион будут стёрты, регулярные пожертвования — отменены. Сами пожертвования останутся в
        учёте мечети, но без связи с вами. Восстановить кабинет будет нельзя.
      </p>
      <div className={styles.actions}>
        <button className={`btn btn-ghost btn-sm ${styles.dangerButton}`} type="button" onClick={() => setStep({ kind: "confirm" })}>
          Удалить аккаунт
        </button>
      </div>

      <Modal isOpen={step.kind !== "closed"} title="Удалить аккаунт?" onClose={close} isDismissible>
        {step.kind === "confirm" ? (
          <div className={styles.section}>
            <p>
              {profile.email === null
                ? "Подтвердим, что это вы: если вход через VK был давно, попросим войти ещё раз."
                : `Отправим код подтверждения на ${profile.email}.`}
            </p>
            <div className={styles.actions}>
              <button className={`btn btn-primary btn-sm`} type="button" aria-busy={isBusy} onClick={() => void start()}>
                Продолжить
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={close}>
                Отмена
              </button>
            </div>
          </div>
        ) : null}

        {step.kind === "code" ? (
          <form className={styles.section} onSubmit={confirmCode} noValidate>
            <label className={field.label} htmlFor={`${ids}-code`}>
              Код из письма
            </label>
            <input
              id={`${ids}-code`}
              className={field.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LOGIN_CODE_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, LOGIN_CODE_LENGTH))}
              data-autofocus
            />
            <div className={styles.actions}>
              <button
                className={`btn btn-ghost btn-sm ${styles.dangerButton}`}
                type="submit"
                disabled={code.length !== LOGIN_CODE_LENGTH}
                aria-busy={isBusy}
              >
                Удалить навсегда
              </button>
            </div>
          </form>
        ) : null}

        {step.kind === "relogin" ? (
          <div className={styles.section}>
            <p>Для удаления войдите через VK ещё раз — так мы убедимся, что это вы. Затем снова нажмите «Удалить аккаунт».</p>
            <div className={styles.actions}>
              <button className="btn btn-primary btn-sm" type="button" aria-busy={isBusy} onClick={() => void reloginWithVk()}>
                Войти через VK
              </button>
            </div>
          </div>
        ) : null}

        {error === null ? null : (
          <p className={field.error} role="alert">
            {error}
          </p>
        )}
      </Modal>
    </section>
  );
}
