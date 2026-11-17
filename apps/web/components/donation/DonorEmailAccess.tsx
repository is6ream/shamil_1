"use client";
import { useEffect, useId, useRef, useState } from "react";
import { donorRequest, DonorRequestError } from "@/lib/donor-client";
import field from "@/components/ui/field.module.css";
import styles from "./DonorEmailAccess.module.css";

export function DonorEmailAccess({ onVerified, embedded = false }: { onVerified: () => Promise<void>; embedded?: boolean }) {
  const id = useId();
  const lock = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(""); const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {

    const update = () => setSecondsLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [challenge, retryAt]);
  useEffect(() => { if (challenge) codeInput.current?.focus(); }, [challenge]);
  function failure(e: unknown) {
    if (e instanceof DonorRequestError && e.code === "RATE_LIMITED") setRetryAt(Date.now() + (e.retryAfterSeconds ?? 60) * 1000);
    setError(e instanceof DonorRequestError ? e.message : "Не удалось связаться с сервером. Повторите попытку.");
  }
  async function send() {
    if (lock.current || Date.now() < retryAt) return;
    if (!emailInput.current?.reportValidity()) return;
    lock.current = true;
    setBusy(true); setError("");
    try { const result = await donorRequest<{ challengeId: string; retryAfterSeconds: number }>("donor/auth/request-code", { email });
      setCode(""); setChallenge(result.challengeId); setRetryAt(Date.now() + result.retryAfterSeconds * 1000);
    } catch (e) { failure(e); } finally { lock.current = false; setBusy(false); }
  }
  async function verify() {
    if (lock.current || code.length !== 6) return;
    lock.current = true;
    setBusy(true); setError("");
    try { await donorRequest("donor/auth/verify", { challengeId: challenge, code }); setCode(""); await onVerified(); }
    catch (e) { failure(e); } finally { lock.current = false; setBusy(false); }
  }
  function submit() {
    if (busy || !emailInput.current?.reportValidity() || (challenge && code.length !== 6)) return;
    void (challenge ? verify() : send());
  }
  const Container = embedded ? "div" : "form";
  return <Container className={styles.access} aria-label="Вход по email" aria-busy={busy} data-private="true" onSubmit={event => { event.preventDefault(); event.stopPropagation(); submit(); }} onKeyDown={event => {
    if (embedded && event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); submit(); }
  }}>
    <p className={styles.hint} id={`${id}-hint`}>{embedded ? "Введите email для доступа к автоплатежам. Мы отправим код для входа." : "Введите email, указанный при подключении автоплатежа. Мы отправим код для входа."}</p>
    <label className={styles.label}>Email<input ref={emailInput} className={`${field.input} ${styles.input}`} type="email" autoComplete="email" required value={email} disabled={busy} readOnly={!!challenge}
      aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={error && !challenge ? true : undefined}
      onChange={e => { setEmail(e.target.value); setError(""); }} /></label>
    {challenge && <label className={styles.label}>Код из письма<input ref={codeInput} className={`${field.input} ${styles.input}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} value={code} disabled={busy}
      aria-invalid={error ? true : undefined} aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`}
      onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }} /></label>}
    {error && <p className={field.error} id={`${id}-error`} role="alert">{error}</p>}
    {challenge && <p className={styles.hint} id={`${id}-status`} role="status">Код отправлен на указанный email и действует 10 минут. Если письма нет, проверьте папку «Спам».</p>}
    <button type={embedded ? "button" : "submit"} onClick={embedded ? submit : undefined} className={styles.action} disabled={busy || !email || (!challenge && secondsLeft > 0) || (!!challenge && code.length !== 6)}>{busy ? challenge ? "Проверяем…" : "Отправляем…" : challenge ? "Войти" : "Получить код"}</button>
    <p className={styles.hint} role="status">{busy ? challenge ? "Проверяем код…" : "Запрашиваем код…" : ""}</p>
    {challenge && <>
      <button type="button" className={styles.resend} disabled={busy || secondsLeft > 0} onClick={() => void send()}>{secondsLeft > 0 ? `Отправить повторно через ${secondsLeft} с` : "Отправить код ещё раз"}</button>
      <button type="button" className={styles.resend} disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(""); emailInput.current?.focus(); }}>Изменить email</button>
    </>}
  </Container>;
}
