"use client";
import { useEffect, useId, useRef, useState } from "react";
import { donorRequest, DonorRequestError } from "@/lib/donor-client";
import field from "@/components/ui/field.module.css";
import styles from "./DonorEmailAccess.module.css";

export function DonorEmailAccess({ onVerified }: { onVerified: () => Promise<void> }) {
  const id = useId();
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  function failure(e: unknown) {
    if (e instanceof DonorRequestError && e.code === "RATE_LIMITED") setRetryAt(Date.now() + (e.retryAfterSeconds ?? 60) * 1000);
    setError(e instanceof DonorRequestError ? e.message : "Не удалось связаться с сервером. Повторите попытку.");
  }
  async function send() {
    if (lock.current || Date.now() < retryAt) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Укажите email в формате name@example.ru"); return; }
    lock.current = true;
    setBusy(true); setError("");
    try { const result = await donorRequest<{ challengeId: string; retryAfterSeconds: number }>("donor/auth/request-code", { email });
      setChallenge(result.challengeId); setCode(""); setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    } catch (e) { failure(e); } finally { lock.current = false; setBusy(false); }
  }
  async function verify() {
    if (lock.current) return;
    if (code.length !== 6) { setError("Введите шесть цифр из письма"); return; }
    lock.current = true;
    setBusy(true); setError("");
    try { await donorRequest("donor/auth/verify", { challengeId: challenge, code }); setCode(""); await onVerified(); }
    catch (e) { failure(e); } finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.access} aria-label="Вход по email" aria-busy={busy} data-private="true" onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); void (challenge ? verify() : send()); }
  }}>
    <p className={styles.hint} id={`${id}-hint`}>Подтвердите приватный email для доступа к автоплатежам. В публичной ленте он не отображается.</p>
    <label className={styles.label}>Email<input className={`${field.input} ${styles.input}`} type="email" autoComplete="email" value={email} disabled={busy}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={error && !challenge ? true : undefined}
      onChange={e => { setEmail(e.target.value); setChallenge(null); setCode(""); }} /></label>
    {challenge && <label className={styles.label}>Код из письма<input className={`${field.input} ${styles.input}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy}
      aria-invalid={error ? true : undefined} aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`}
      onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>}
    {error && <p className={field.error} id={`${id}-error`} role="alert">{error}</p>}
    {challenge && <p className={styles.hint} id={`${id}-status`} role="status">Код отправлен и действует 10 минут. {seconds > 0 ? `Повторная отправка через ${seconds} с.` : "Можно запросить новый код."}</p>}
    <button type="button" className={styles.action} aria-busy={busy} disabled={busy || !email || (!challenge && seconds > 0)} onClick={() => void (challenge ? verify() : send())}>{busy ? challenge ? "Проверяем…" : "Отправляем…" : challenge ? "Подтвердить email" : "Получить код"}</button>
    {challenge && <button type="button" className={styles.resend} disabled={busy || seconds > 0} onClick={() => void send()}>Отправить код ещё раз</button>}
  </section>;
}
