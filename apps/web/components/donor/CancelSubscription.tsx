"use client";

import Link from "next/link";
import { useState } from "react";

import { API_URL } from "@/lib/site";

import styles from "./Subscriptions.module.css";

export function CancelSubscription({ token }: { readonly token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/donor/subscriptions/cancel-by-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        setDone(true);
        window.history.replaceState(null, "", window.location.pathname);
      } else if (response.status === 404 || response.status === 410) {
        setError("Ссылка недействительна или устарела. Отменить списания можно в личном кабинете.");
      } else {
        setError("Не удалось отменить пожертвование. Попробуйте ещё раз.");
      }
    } catch {
      setError("Не удалось связаться с сайтом. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.cancelPage}>
      <div className={`card ${styles.panel}`}>
        <h1 className={styles.heading}>Отмена регулярного пожертвования</h1>
        {done ? (
          <p role="status">Регулярное пожертвование отменено. Будущие списания остановлены.</p>
        ) : token === null ? (
          <p>Ссылка недействительна. Отменить списания можно в личном кабинете.</p>
        ) : (
          <>
            <p>Подтвердите отмену будущих списаний.</p>
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void cancel()}>
              {busy ? "Отменяем…" : "Отменить регулярное пожертвование"}
            </button>
          </>
        )}
        {error !== null && <p role="alert">{error}</p>}
        <Link className="btn btn-ghost" href="/profile/subscriptions">Открыть личный кабинет</Link>
      </div>
    </main>
  );
}
