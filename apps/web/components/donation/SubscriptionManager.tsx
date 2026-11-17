"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DONATION_FREQUENCIES, type DonationFrequency } from "./donation-form.model";
import { SubscriptionAccess } from "./SubscriptionAccess";
import styles from "./SubscriptionManager.module.css";

export interface Subscription {
  state: "pending" | "active" | "cancelled" | "failed" | "review";
  amountKopecks: string; frequency: DonationFrequency;
  termsVersion: string; consentedAt: string;
  nextAt: string | null; firstPayment: string;
  latestAttempt: { period: string; state: string } | null;
}

const labels = {
  pending: "Ожидается подтверждение первого платежа", active: "Автосписания подключены",
  cancelled: "Автосписания отключены", failed: "Первый платёж отклонён", review: "Автосписания приостановлены для сверки",
};
const dateLabel = (date: string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

export function SubscriptionManager() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    let stopped = false;
    void fetch("/api/donation-recurring?status=1", { cache: "no-store" }).then(async response => {
      if (response.ok) { const data = await response.json(); if (!stopped) setSubscription(data); }
      else if (response.status !== 404) throw new Error();
    }).catch(() => { if (!stopped) setError("Не удалось получить статус. Обновите страницу или восстановите доступ по коду."); })
      .finally(() => { if (!stopped) setBusy(false); });
    return () => { stopped = true; };
  }, []);

  async function action(cancel: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/donation-recurring?${cancel ? "cancel" : "restore"}=1`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        ...(cancel ? {} : { body: JSON.stringify({ code: code.trim() }) }),
      });
      if (!response.ok) throw new Error();
      const data: Subscription = await response.json();
      if (cancel && data.state !== "cancelled") throw new Error();
      setSubscription(data); setCode("");
    } catch {
      setError(cancel ? "Не удалось подтвердить отключение. Обновите статус и повторите запрос."
        : "Не удалось восстановить доступ. Проверьте код и повторите попытку.");
    } finally { setBusy(false); }
  }

  return <div className={styles.manager} data-private="true">
    {busy && <p role="status">Получаем ответ сервера…</p>}
    {error && <p role="alert">{error}</p>}
    {subscription && <>
      <h2 aria-live="polite">{labels[subscription.state]}</h2>
      <dl className={styles.details}>
        <dt>Каждое пожертвование</dt><dd>{(Number(subscription.amountKopecks) / 100).toLocaleString("ru-RU")} ₽</dd>
        <dt>Периодичность</dt><dd>{DONATION_FREQUENCIES[subscription.frequency].label}</dd>
        <dt>Следующая операция</dt><dd>{subscription.nextAt ? dateLabel(subscription.nextAt) + " МСК" : subscription.state === "cancelled" ? "Новые списания отключены" : "Дата пока не назначена"}</dd>
        <dt>Согласие</dt><dd>{dateLabel(subscription.consentedAt)} МСК · версия {subscription.termsVersion}</dd>
      </dl>
      <p>Первый платёж: {subscription.firstPayment === "paid" ? "подтверждён" : subscription.firstPayment === "failed" ? "отклонён" : "ожидает подтверждения"}.</p>
      {subscription.state === "cancelled" ? <p>Сервер подтвердил отключение автосписаний. Новые операции отправляться не будут.</p>
        : <div className={styles.actions}><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void action(true)}>Отключить автосписания</button></div>}
      <p>Уже отправленная операция может завершиться после отмены и будет учтена по факту. Она не возобновит подписку.</p>
      <SubscriptionAccess />
    </>}
    {!subscription && !busy && !error && <p>Подписка в этом браузере не найдена. Введите код, сохранённый перед оплатой.</p>}
    <form className={styles.restore} onSubmit={event => { event.preventDefault(); void action(false); }}>
      <h2>Доступ с другого устройства</h2>
      <label htmlFor="subscription-access-code">Секретный код доступа</label>
      <input className={styles.input} id="subscription-access-code" aria-describedby="subscription-access-help" name="subscriptionAccessCode" type="password" autoComplete="off" spellCheck={false} value={code} maxLength={64} required pattern="[0-9a-f]{64}" onChange={event => setCode(event.target.value)} />
      <p id="subscription-access-help">Введите 64 символа из сохранённого файла. Код не отправляется платёжной системе. Открытие страницы и восстановление доступа сами по себе ничего не отменяют.</p>
      <div className={styles.actions}><button className="btn btn-ghost" disabled={busy} type="submit">Восстановить доступ</button>
        <button className="btn btn-ghost" disabled={busy} type="button" onClick={() => window.location.reload()}>Обновить статус</button></div>
    </form>
    <Link href="/donate/recurring-terms">Условия регулярных пожертвований и отмены</Link>
    <Link href="/#donate">К форме пожертвования</Link>
  </div>;
}
