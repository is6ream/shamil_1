"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { donorRequest, DonorRequestError } from "@/lib/donor-client";
import { donorDate, donorMoney, donorState, type DonorSubscription as Subscription, type DonorHistory as History, type DonorPage as Page } from "@/lib/donor-view";
import { DonorEmailAccess } from "./DonorEmailAccess";
import { DONATION_FREQUENCIES } from "./donation-form.model";
import styles from "./DonorSubscriptions.module.css";

function message(error: unknown) { return error instanceof DonorRequestError ? error.message : "Не удалось связаться с сервером. Повторите попытку."; }
function expired(error: unknown) { return error instanceof DonorRequestError && error.code === "AUTH_REQUIRED"; }
export function DonorSubscriptions() {
 const id = useId();
 const [session, setSession] = useState<"loading" | "anonymous" | "ready" | "error">("loading");
 const [busy, setBusy] = useState(false); const [loggingOut, setLoggingOut] = useState(false);
 const [page, setPage] = useState<Page<Subscription>>({items: [], nextCursor: null});
 const [error, setError] = useState(""); const [notice, setNotice] = useState("");
 const generation = useRef(0); const requestLock = useRef(false);
 const expire = useCallback(() => {
  generation.current++; setSession("anonymous"); setPage({items: [], nextCursor: null});
  setNotice("Сессия завершилась. Войдите по email ещё раз.");
 }, []);
 const load = useCallback(async (cursor?: string) => {
  if (requestLock.current) return;
  requestLock.current = true; const version = generation.current; setBusy(true); setError("");
  try {
   const result = await donorRequest<Page<Subscription>>("donor/subscriptions" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
   if (generation.current === version) setPage(old => ({...result, items: cursor ? [...old.items, ...result.items] : result.items}));
  } catch (e) { if (expired(e)) expire(); else setError(message(e)); }
  finally { requestLock.current = false; setBusy(false); }
 }, [expire]);
 const checkSession = useCallback(async () => {
  try { await donorRequest("donor/auth/session"); setSession("ready"); setNotice(""); await load(); }
  catch (e) { if (expired(e)) setSession("anonymous"); else { setSession("error"); setError(message(e)); } }
 }, [load]);
 useEffect(() => {
  let active = true;
  void donorRequest("donor/auth/session").then(async () => {
   if (active) { setSession("ready"); await load(); }
  }).catch(e => {
   if (!active) return;
   if (expired(e)) setSession("anonymous"); else { setSession("error"); setError(message(e)); }
  });
  return () => { active = false; };
 }, [load]);
 async function logout() {
  setLoggingOut(true); setError("");
  try { await donorRequest("donor/auth/logout", {}); generation.current++; setSession("anonymous"); setPage({items: [], nextCursor: null}); setNotice("Вы вышли из личного кабинета."); }
  catch (e) { setError("Выход не подтверждён сервером. Повторите попытку. " + message(e)); }
  finally { setLoggingOut(false); }
 }
  return <section className={styles.cabinet} aria-labelledby={id} data-private="true">
    <div className={styles.toolbar}>
      <h2 id={id}>{(session === "ready") ? "Мои автоплатежи" : "Вход по email"}</h2>
      {(session === "ready") && <button type="button" className={styles.textButton} disabled={busy || loggingOut} onClick={() => void logout()}>{loggingOut ? "Выходим…" : "Выйти"}</button>}
    </div>
    {session === "anonymous" && <div className={styles.access}><DonorEmailAccess onVerified={checkSession} /></div>}
    {(session === "ready") && <div className={styles.list}>
      {!busy && !error && !page.items.length && <p className={styles.empty} role="status">Автоплатежей пока нет.</p>}
      {page.items.map(sub => <SubscriptionCard key={sub.id} sub={sub} onExpired={expire} onCancelled={updated => { setPage(old => ({ ...old, items: old.items.map(item => item.id === updated.id ? updated : item) })); }} refresh={() => load()} />)}
      {page.nextCursor && <button type="button" className={styles.secondary} disabled={busy || loggingOut} onClick={() => void load(page.nextCursor!)}>Показать ещё</button>}
    </div>}
    <div role="status" className={styles.message}>{session === "loading" ? "Проверяем вход…" : busy ? "Загружаем автоплатежи…" : ""}</div>
    {notice && <p role="status" className={styles.message}>{notice}</p>}
    {error && <div><p className={styles.error} role="alert">{error}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => void (session === "error" ? checkSession() : load())}>Повторить загрузку</button></div>}
  </section>;
}

function SubscriptionCard({ sub, refresh, onExpired, onCancelled }: { sub: Subscription; refresh: () => Promise<void>; onExpired: () => void; onCancelled: (sub: Subscription) => void }) {
  const id = useId();
  const lock = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null), keepButton = useRef<HTMLButtonElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<Page<History> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false), [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelled = sub.state === "cancelled";
  useEffect(() => { if (confirm) keepButton.current?.focus(); }, [confirm]);
  async function historyPage(cursor?: string) {
    if (lock.current) return;
    lock.current = true; setHistoryBusy(true); setHistoryError("");
    try {
      const result = await donorRequest<Page<History>>(`donor/subscriptions/${sub.id}/history` + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
      setHistory(old => ({ ...result, items: cursor ? [...(old?.items ?? []), ...result.items] : result.items }));
    } catch (e) { if (expired(e)) onExpired(); else setHistoryError(message(e)); }
    finally { lock.current = false; setHistoryBusy(false); }
  }
  function closeConfirm() { setConfirm(false); cancelButton.current?.focus(); }
  return <article className={styles.card} aria-labelledby={`${id}-amount`}>
    <div className={styles.cardHeading}>
      <h3 id={`${id}-amount`} className={styles.amount}>{donorMoney(sub.amountKopecks)}<span>{DONATION_FREQUENCIES[sub.frequency]?.label ?? "Периодичность уточняется"}</span></h3>
      <span className={`${styles.badge} ${sub.state === "active" ? styles.active : ""}`} role="status">{donorState(sub.state)}</span>
    </div>
    <dl className={styles.details}>
      <div className={styles.next}><dt>Следующее списание</dt><dd>{cancelled ? "Автоплатёж отключён" : sub.nextAt ? <time dateTime={sub.nextAt}>{donorDate(sub.nextAt)}</time> : "Дата пока не назначена"}</dd></div>
      <div><dt>Первый платёж</dt><dd>{donorState(sub.firstPayment)}</dd></div>
      {sub.latestAttempt && <div><dt>Последняя операция</dt><dd>{donorState(sub.latestAttempt.state)}</dd></div>}
    </dl>
    <div className={styles.actions}>
      <button ref={historyButton} type="button" className={styles.secondary} aria-expanded={historyOpen} aria-controls={`${id}-history`} onClick={() => {
        setHistoryOpen(!historyOpen); if (!historyOpen && !history && !historyBusy) void historyPage();
      }}>{historyOpen ? "Скрыть историю" : "История платежей"}</button>
      {!cancelled && <button ref={cancelButton} type="button" className={styles.dangerLink} disabled={busy || historyBusy} aria-expanded={confirm} aria-controls={`${id}-confirm`} onClick={() => setConfirm(true)}>Отключить автосписания</button>}
    </div>
    <div id={`${id}-history`} hidden={!historyOpen} className={styles.history}>
      <h4>История платежей</h4>
      <p role="status" className={styles.message}>{historyBusy ? "Загружаем платежи…" : ""}</p>
      {history && !history.items.length && <p className={styles.note}>Платежей пока нет.</p>}
      {history && history.items.length > 0 && <ul className={styles.historyList}>{history.items.map(item => <li key={item.orderId}>
        <div><strong>{donorMoney(item.paidAmountKopecks ?? item.amountKopecks)}</strong><span>{item.kind === "first" ? "Первый платёж" : "Повторный платёж"}</span></div>
        <div><span>{donorState(item.status)}{item.operationState && item.operationState !== item.status ? " · " + donorState(item.operationState) : ""}</span><span className={styles.note}>{item.paidAt ? <time dateTime={item.paidAt}>{donorDate(item.paidAt)}</time> : "Дата оплаты не подтверждена"}</span></div>
      </li>)}</ul>}
      {historyError && <p role="alert" className={styles.error}>{historyError}</p>}
      {historyError ? <button type="button" className={styles.secondary} disabled={historyBusy} onClick={() => void historyPage(history?.nextCursor ?? undefined)}>Повторить загрузку</button> : history?.nextCursor && <button type="button" className={styles.secondary} disabled={historyBusy} onClick={() => void historyPage(history.nextCursor!)}>Ещё платежи</button>}
    </div>
    {confirm && !cancelled && <div id={`${id}-confirm`} className={styles.confirm} role="group" aria-labelledby={`${id}-question`} onKeyDown={event => { if (event.key === "Escape" && !busy) closeConfirm(); }}>
      <h4 id={`${id}-question`}>Отключить автосписания?</h4>
      <p>Новые списания по {donorMoney(sub.amountKopecks)} прекратятся. Уже отправленная операция может завершиться.</p>
      <div className={styles.actions}>
        <button ref={keepButton} type="button" className={styles.secondary} disabled={busy || historyBusy} onClick={closeConfirm}>Оставить автоплатёж</button>
        <button type="button" className={styles.dangerButton} disabled={busy || historyBusy} onClick={async () => {
          if (lock.current) return;
          lock.current = true; setBusy(true); setError("");
          try {
            const result = await donorRequest<Subscription>(`donor/subscriptions/${sub.id}/cancel`, {});
            if (result.id !== sub.id || result.state !== "cancelled") throw new Error("Unconfirmed cancellation");
            onCancelled(result); await refresh(); setConfirm(false); historyButton.current?.focus();
          }
          catch (e) { if (expired(e)) onExpired(); else setError("Отключение не подтверждено. Обновите страницу или повторите попытку. Уже отправленная операция может завершиться."); }
          finally { lock.current = false; setBusy(false); }
        }}>{busy ? "Отключаем…" : "Подтвердить отключение"}</button>
      </div>
      <p role="status" className={styles.message}>{busy ? "Ожидаем подтверждение отключения…" : ""}</p>
    </div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </article>;
}
