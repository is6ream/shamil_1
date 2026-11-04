"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";

import { Modal } from "@/components/admin/ui/Modal";
import { Checkbox } from "@/components/ui/Checkbox";
import field from "@/components/ui/field.module.css";
import { errorMessage } from "@/lib/admin/errors";
import { PAGES } from "@/lib/content";
import { CODE_RESEND_SECONDS, DONOR_AUTH_PATHS, LOGIN_CODE_LENGTH } from "@/lib/donor/endpoints";
import { completeDonorLogin, donorClient, loadLoginMethods } from "@/lib/donor/session";
import type { DonorSessionResponse, LoginMethods } from "@/lib/donor/types";

import styles from "./DonorLoginDialog.module.css";

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Путь сайта, куда вернуть после входа через VK (по почте — остаёмся на месте). */
  readonly returnTo: string;
  /** Вход прошёл. Здесь уводят в кабинет или просто закрывают окно. */
  readonly onSignedIn: () => void;
  /** Причина, по которой окно открылось: «Не получилось войти через VK». */
  readonly notice?: string | null;
  /** Ссылка «Вход для сотрудников» — только в окне из шапки сайта. */
  readonly onStaffLogin?: () => void;
  /** В кабинете без входа закрыть окно — значит уйти на главную. */
  readonly isDismissible?: boolean;
}

/**
 * «Личный кабинет»: код на почту или VK ID. Аккаунт создаётся при первом
 * верном коде — паролей нет. Галочка согласия на обработку ПДн обязательна
 * для обоих способов: сервер без `pdConsent: true` не пускает (152-ФЗ).
 */
export function DonorLoginDialog({ isOpen, onClose, returnTo, onSignedIn, notice = null, onStaffLogin, isDismissible = true }: Props) {
  return (
    <Modal isOpen={isOpen} title="Личный кабинет" onClose={onClose} isDismissible={isDismissible}>
      <LoginFlow returnTo={returnTo} onSignedIn={onSignedIn} notice={notice} onStaffLogin={onStaffLogin} />
    </Modal>
  );
}

type Step = { readonly kind: "email" } | { readonly kind: "code"; readonly email: string };

function LoginFlow({ returnTo, onSignedIn, notice, onStaffLogin }: Omit<Props, "isOpen" | "onClose" | "isDismissible">) {
  const ids = useId();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    let isActive = true;

    void loadLoginMethods().then((loaded) => {
      if (isActive) {
        setMethods(loaded);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }

    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);

    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendCode(address: string): Promise<boolean> {
    setBusy(true);
    setError(null);

    try {
      await donorClient().request(DONOR_AUTH_PATHS.requestCode, { method: "POST", body: { email: address }, skipAuthRetry: true });
      setResendIn(CODE_RESEND_SECONDS);
      return true;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const address = email.trim();

    if (!consent || address === "") {
      return;
    }

    if (await sendCode(address)) {
      setCode("");
      setStep({ kind: "code", email: address });
    }
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step.kind !== "code" || code.length !== LOGIN_CODE_LENGTH) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const session = await donorClient().request<DonorSessionResponse>(DONOR_AUTH_PATHS.verify, {
        method: "POST",
        body: { email: step.email, code, pdConsent: true },
        skipAuthRetry: true,
      });

      await completeDonorLogin(session);
      onSignedIn();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function handleVk() {
    if (!consent) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // Cookie со state ставит API на свой домен, поэтому fetch, а не ссылка.
      const { url } = await donorClient().request<{ url: string }>(DONOR_AUTH_PATHS.vkStart, {
        method: "POST",
        body: { pdConsent: true, returnTo },
        skipAuthRetry: true,
      });

      window.location.assign(url);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  if (step.kind === "code") {
    return (
      <form className={styles.form} onSubmit={handleCode} noValidate>
        <p className={styles.lead}>
          Отправили код на <b>{step.email}</b>. Письмо может попасть в «Промоакции» или «Спам».
        </p>
        <label className={field.label} htmlFor={`${ids}-code`}>
          Код из письма
        </label>
        <input
          id={`${ids}-code`}
          className={`${field.input} ${styles.code}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={LOGIN_CODE_LENGTH}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, LOGIN_CODE_LENGTH))}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : `${ids}-error`}
          data-autofocus
        />
        {error === null ? null : (
          <p className={field.error} id={`${ids}-error`} role="alert">
            {error}
          </p>
        )}
        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={code.length !== LOGIN_CODE_LENGTH}
          aria-busy={isBusy}
        >
          Войти
        </button>
        <div className={styles.secondary}>
          <button
            type="button"
            className={styles.link}
            disabled={resendIn > 0 || isBusy}
            onClick={() => {
              void sendCode(step.email);
            }}
          >
            {resendIn > 0 ? `Отправить ещё раз через ${resendIn} с` : "Отправить код ещё раз"}
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setError(null);
              setStep({ kind: "email" });
            }}
          >
            Изменить почту
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleEmail} noValidate>
      {notice === null ? null : (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}
      <p className={styles.lead}>
        Здесь — история ваших пожертвований, справка для налогового вычета и настройки. Пароль не нужен: пришлём код на почту.
      </p>
      <label className={field.label} htmlFor={`${ids}-email`}>
        Электронная почта
      </label>
      <input
        id={`${ids}-email`}
        className={field.input}
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={error === null ? undefined : true}
        aria-describedby={error === null ? undefined : `${ids}-error`}
        data-autofocus
      />
      {error === null ? null : (
        <p className={field.error} id={`${ids}-error`} role="alert">
          {error}
        </p>
      )}
      <div className={styles.consent}>
        <Checkbox id={`${ids}-consent`} name="pdConsent" checked={consent} onChange={setConsent}>
          Даю согласие на{" "}
          <Link href={PAGES.consent.href} target="_blank" rel="noopener">
            обработку персональных данных
          </Link>{" "}
          по{" "}
          <Link href={PAGES.privacy.href} target="_blank" rel="noopener">
            Политике
          </Link>
        </Checkbox>
      </div>
      <button
        className="btn btn-primary btn-block"
        type="submit"
        disabled={!consent || email.trim() === ""}
        aria-busy={isBusy}
      >
        Продолжить
      </button>
      {methods?.vk === true ? (
        <>
          <p className={styles.or}>или</p>
          <button
            className="btn btn-ghost btn-block"
            type="button"
            disabled={!consent || isBusy}
            onClick={() => {
              void handleVk();
            }}
          >
            Войти через VK ID
          </button>
        </>
      ) : null}
      {onStaffLogin === undefined ? null : (
        <button type="button" className={`${styles.link} ${styles.staff}`} onClick={onStaffLogin}>
          Вход для сотрудников
        </button>
      )}
    </form>
  );
}
