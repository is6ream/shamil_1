"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { donorRequest, DonorRequestError } from "@/lib/donor-client";
import { donorDate, donorMoney, donorState, type DonorSubscription as Subscription, type DonorHistory as History, type DonorPage as Page } from "@/lib/donor-view";
import { DonorEmailAccess } from "./DonorEmailAccess";
import { DONATION_FREQUENCIES } from "./donation-form.model";
import styles from "./DonorSubscriptions.module.css";
import field from "@/components/ui/field.module.css";

function message(error: unknown) { return error instanceof DonorRequestError ? error.message : "Не удалось связаться с сервером. Повторите попытку."; }
function expired(error: unknown) { return error instanceof DonorRequestError && error.code === "AUTH_REQUIRED"; }
export function DonorSubscriptions() {
 const [session, setSession] = useState<"loading" | "anonymous" | "ready" | "error">("loading");
 const [busy, setBusy] = useState(false); const [loggingOut, setLoggingOut] = useState(false);
 const [page, setPage] = useState<Page<Subscription>>({items: [], nextCursor: null});
 const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [legacy, setLegacy] = useState("");
 const generation = useRef(0); const requestLock = useRef(false);
 const expire = useCallback(() => {
  generation.current++; setSession("anonymous"); setPage({items: [], nextCursor: null}); setLegacy("");
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
  try { await donorRequest("donor/auth/logout", {}); generation.current++; setSession("anonymous"); setPage({items: [], nextCursor: null}); setLegacy(""); setNotice("Вы вышли из личного кабинета."); }
  catch (e) { setError("Выход не подтверждён сервером. Повторите попытку. " + message(e)); }
  finally { setLoggingOut(false); }
 }
 return <section className={styles.cabinet} aria-label="Автоплатежи" data-private="true">
  <div className={styles.heading}><h2>Автоплатежи</h2>{session === "ready" && <div className={styles.actions}>
   <button type="button" className="btn btn-ghost" disabled={busy || loggingOut} onClick={() => void load()}>Обновить состояние</button>
   <button type="button" className="btn btn-ghost" disabled={busy || loggingOut} onClick={() => void logout()}>{loggingOut ? "Выходим…" : "Выйти"}</button>
  </div>}</div>
  {notice && <p role="status">{notice}</p>}
  {session === "loading" && <p role="status">Проверяем вход…</p>}
  {session === "anonymous" && <div className={styles.signIn}><DonorEmailAccess onVerified={checkSession} /></div>}
  {error && <div><p role="alert">{error}</p><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void (session === "error" ? checkSession() : load())}>Повторить загрузку</button></div>}
  {session === "ready" && <>
   {busy && <p role="status">Обновляем состояние…</p>}
   {!busy && !error && !page.items.length && <div className={styles.empty}><p>Автоплатежей пока нет.</p><Link className="btn btn-ghost" href="/#donate">Выбрать регулярное пожертвование</Link></div>}
   {error && page.items.length > 0 && <p>Показаны ранее полученные данные.</p>}
   {page.items.map(sub => <SubscriptionCard key={sub.id} sub={sub} onExpired={expire} onCancelled={updated => {
    setPage(old => ({...old, items: old.items.map(item => item.id === updated.id ? updated : item)}));
   }} />)}
   {page.nextCursor && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load(page.nextCursor!)}>Показать ещё</button>}
   <details className={styles.legacy}><summary>Присоединить прежнюю подписку по секретному коду</summary>
    <p>Подписка появится здесь только после проверки кода доступа.</p>
    <label>Секретный код<input className={field.input} type="password" autoComplete="off" value={legacy} onChange={e => setLegacy(e.target.value)} /></label>
    <button type="button" className="btn btn-ghost" disabled={busy || loggingOut || !legacy} onClick={async () => {
     setBusy(true); setError(""); try { await donorRequest("donor/subscriptions/claim", {legacyKey: legacy.trim()}); setLegacy(""); await load(); }
     catch (e) { if (expired(e)) expire(); else setError(message(e)); } finally {setBusy(false);}
    }}>Присоединить</button>
   </details>
  </>}
 </section>;
}
function SubscriptionCard({sub, onCancelled, onExpired}: {sub: Subscription; onCancelled: (sub: Subscription) => void; onExpired: () => void}) {
 const [history, setHistory] = useState<Page<History> | null>(null); const [confirm, setConfirm] = useState(false);
 const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
 const lock = useRef(false);
 async function historyPage(cursor?: string) {
  if (lock.current) return; lock.current = true; setLoading(true); setError("");
  try { const result = await donorRequest<Page<History>>("donor/subscriptions/" + sub.id + "/history" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""));
   setHistory(old => ({...result, items: cursor ? [...(old?.items ?? []), ...result.items] : result.items}));
  } catch (e) { if (expired(e)) onExpired(); else setError(message(e)); } finally {lock.current = false; setLoading(false);}
 }
 async function cancel() {
  if (lock.current) return; lock.current = true; setBusy(true); setError("");
  try {
   const result = await donorRequest<Subscription>("donor/subscriptions/" + sub.id + "/cancel", {});
   if (result.id !== sub.id || result.state !== "cancelled") throw Error();
   onCancelled(result); setConfirm(false); setNotice("Отмена подтверждена сервером. Будущие списания отключены.");
  } catch (e) { if (expired(e)) onExpired(); else setError("Ответ об отмене не подтверждён. Обновите состояние или повторите отмену. Уже отправленная операция может завершиться."); }
  finally {lock.current = false; setBusy(false);}
 }
 return <article className={styles.subscription} aria-label={donorMoney(sub.amountKopecks) + " · " + DONATION_FREQUENCIES[sub.frequency]?.label}>
  <div className={styles.heading}><h3>{donorMoney(sub.amountKopecks)} <span>· {DONATION_FREQUENCIES[sub.frequency]?.label}</span></h3><p className={styles.state}>{donorState(sub.state)}</p></div>
  <dl className={styles.facts}>
   <dt>Первый платёж</dt><dd>{donorState(sub.firstPayment)}</dd>
   <dt>Следующее списание</dt><dd>{sub.state === "cancelled" ? "Будущие списания отключены" : sub.state === "pending" ? "Дата будет назначена после подтверждения первого платежа" : sub.nextAt ? donorDate(sub.nextAt) : "Дата пока не назначена"}</dd>
   {sub.latestAttempt && <><dt>Последняя операция</dt><dd>{donorState(sub.latestAttempt.state)}</dd></>}
  </dl>
  {sub.state === "pending" && <p>Возврат со страницы оплаты не подтверждает платёж. Обновите состояние, чтобы получить ответ сервера.</p>}
  <div className={styles.actions}><button type="button" className="btn btn-ghost" disabled={busy || loading} aria-expanded={history !== null} onClick={() => void historyPage()}>{loading ? "Загружаем историю…" : "История платежей"}</button>
  {sub.state !== "cancelled" && !confirm && <button type="button" className="btn btn-ghost" disabled={busy || loading} onClick={() => setConfirm(true)}>Отменить будущие списания</button>}</div>
  {history && <div className={styles.history}><h4>История платежей</h4>{!history.items.length && <p>Платежей пока нет.</p>}<ul>{history.items.map(item => <li key={item.orderId}>
   <div><strong>{item.kind === "first" ? "Первый платёж" : "Повторный платёж"}</strong><span>{donorMoney(item.paidAmountKopecks ?? item.amountKopecks)}</span></div>
   <div><span>{donorState(item.status)}{item.operationState ? " · " + donorState(item.operationState) : ""}</span><span>{item.paidAt ? donorDate(item.paidAt) : item.scheduledAt ? donorDate(item.scheduledAt) : "Дата оплаты пока не подтверждена"}</span></div>
  </li>)}</ul>{history.nextCursor && <button type="button" className="btn btn-ghost" disabled={busy || loading} onClick={() => void historyPage(history.nextCursor!)}>Ещё платежи</button>}</div>}
  {confirm && sub.state !== "cancelled" && <div className={styles.confirm} role="group" aria-label="Подтверждение отмены"><p>Отключить будущие списания? Уже отправленная операция может завершиться после отмены.</p><div className={styles.actions}>
   <button type="button" className="btn" disabled={busy || loading} onClick={() => void cancel()}>{busy ? "Отменяем…" : "Подтвердить отмену"}</button>
   <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>Оставить автоплатёж</button>
  </div></div>}
  {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
 </article>;
}
