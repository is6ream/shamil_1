"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { errorMessage } from "@/lib/admin/errors";
import { useDonorQuery } from "@/lib/donor/hooks";
import { donorClient } from "@/lib/donor/session";
import { kopecksToRubDisplay } from "@/lib/money";

import styles from "./Subscriptions.module.css";

const PATH = "/donor/subscriptions";
const PERIOD = { FRIDAY: "Каждую пятницу", MONTHLY: "Ежемесячно" } as const;
const STATUS = {
  PENDING: "Ожидает первого платежа",
  ACTIVE: "Активно",
  PAUSED: "На паузе",
  CANCELLED: "Отменено",
  FAILED: "Остановлено после отказов",
} as const;

interface Subscription {
  readonly id: string;
  readonly amountKopecks: string;
  readonly period: keyof typeof PERIOD;
  readonly status: keyof typeof STATUS;
  readonly nextChargeAt: string | null;
}

function amountFrom(form: HTMLFormElement) {
  return Number(new FormData(form).get("rubles")) * 100;
}

export function Subscriptions() {
  const list = useDonorQuery<readonly Subscription[]>(PATH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const enabled = process.env.NEXT_PUBLIC_RECURRING_ENABLED === "true";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountKopecks = amountFrom(event.currentTarget);
    void run(async () => {
      const payment = await donorClient().request<{ redirectUrl: string }>(PATH, {
        method: "POST",
        body: { amountKopecks, period: form.get("period"), recurringConsent: form.get("consent") === "on" },
      });
      window.location.assign(payment.redirectUrl);
    });
  }

  function update(id: string, body: { amountKopecks?: number; paused?: boolean }) {
    void run(async () => {
      await donorClient().request(`${PATH}/${id}`, { method: "PATCH", body });
      list.reload();
    });
  }

  return (
    <section className={styles.stack} aria-label="Регулярная помощь">
      <h1 className={styles.heading}>Регулярная помощь</h1>
      {enabled && (
        <form className={`card ${styles.panel}`} onSubmit={create}>
          <h2 className={styles.heading}>Оформить пожертвование</h2>
          <fieldset className={styles.fields} disabled={busy}>
            <label>Сумма, ₽ <input name="rubles" type="number" min="10" max="10000000" step="1" defaultValue="100" required /></label>
            <label>Периодичность <select name="period" defaultValue="FRIDAY">
              <option value="FRIDAY">{PERIOD.FRIDAY}</option>
              <option value="MONTHLY">{PERIOD.MONTHLY}</option>
            </select></label>
            <label className={styles.consent}>
              <input type="checkbox" name="consent" required />
              Соглашаюсь на автоматическое списание выбранной суммы с карты с указанной периодичностью до отмены.
            </label>
            <p>Первый платёж — при оформлении. Отменить регулярное пожертвование можно здесь или по ссылке из письма.</p>
            <button className="btn btn-primary" type="submit">Перейти к оплате картой</button>
          </fieldset>
        </form>
      )}
      {error !== null && <p role="alert">{error}</p>}
      {list.isLoading && <p role="status">Загружаем регулярные пожертвования…</p>}
      {list.error !== null && (
        <div><p role="alert">{list.error}</p><button className="btn btn-ghost" onClick={list.reload}>Попробовать ещё раз</button></div>
      )}
      {list.data?.length === 0 && <p>У вас пока нет регулярных пожертвований.</p>}
      {list.data?.map((row) => {
        const editable = row.status === "ACTIVE" || row.status === "PAUSED";
        return (
          <article className={`card ${styles.panel}`} key={row.id}>
            <h2 className={styles.heading}>{kopecksToRubDisplay(row.amountKopecks)}</h2>
            <p>{PERIOD[row.period]} · {STATUS[row.status]}</p>
            {row.nextChargeAt !== null && (
              <p>Следующее списание {new Date(row.nextChargeAt).toLocaleDateString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}</p>
            )}
            {editable && (
              <form className={styles.actions} onSubmit={(event) => {
                event.preventDefault();
                update(row.id, { amountKopecks: amountFrom(event.currentTarget) });
              }}>
                <label>Новая сумма, ₽ <input name="rubles" type="number" min="10" max="10000000" step="1" required disabled={busy} /></label>
                <button className="btn btn-ghost" disabled={busy}>Сохранить сумму</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => update(row.id, { paused: row.status === "ACTIVE" })}>
                  {row.status === "ACTIVE" ? "Приостановить" : "Возобновить"}
                </button>
              </form>
            )}
            {row.status !== "CANCELLED" && (cancelId === row.id ? (
              <div className={styles.actions}>
                <p>Отменить будущие списания?</p>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(async () => {
                  await donorClient().request(`${PATH}/${row.id}/cancel`, { method: "POST" });
                  setCancelId(null);
                  list.reload();
                })}>Подтвердить отмену</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setCancelId(null)}>Сохранить подписку</button>
              </div>
            ) : (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setCancelId(row.id)}>Отменить регулярное пожертвование</button>
            ))}
          </article>
        );
      })}
    </section>
  );
}
