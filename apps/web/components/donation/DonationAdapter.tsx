"use client";

import { metrika } from "@/lib/analytics/metrika";
import { useEffect, useRef, useState } from "react";
import { donorRequest, DonorRequestError } from "@/lib/donor-client";
import access from "./DonorEmailAccess.module.css";
import { DonorEmailAccess } from "./DonorEmailAccess";

import { createDonation } from "@/lib/api/client";
import { buildCreateDonationBodyFromKopecks } from "@/lib/api/donation-body";
import type { Region } from "@/lib/api/types";
import { readStoredAttribution } from "@/lib/attribution";

import { DonationForm } from "./DonationForm";
import { PREVIEW_CAPABILITIES } from "./donation-form.model";
import type { DonationCapabilities, DonationSubmission } from "./donation-form.model";

// Recurring starts closed and is advertised only by verified server capabilities.
const initialCapabilities: DonationCapabilities = { ...PREVIEW_CAPABILITIES, oneTimeMethods: ["transfer"], recurring: null };
type Capabilities = { online: boolean; recurring: null | { version: string; termsUrl: string; cancellationUrl: string;
  dates: Record<"daily" | "every_friday" | "monthly", string>; minKopecks: string; maxKopecks: string } };
function formCapabilities(result: Capabilities): DonationCapabilities {
  return { ...PREVIEW_CAPABILITIES, oneTimeMethods: result.online ? PREVIEW_CAPABILITIES.oneTimeMethods : ["transfer"], recurring: result.recurring ? {
    methods: ["card"], frequencies: ["monthly", "every_friday", "daily"], ...result.recurring,
    minRubles: Number(result.recurring.minKopecks) / 100,
    maxRubles: Number(result.recurring.maxKopecks) / 100,
  } : null };
}

function bodyFor(data: DonationSubmission, clientId: string | null) {
  const transfer = data.paymentMethod === "transfer";
  const name = data.isAnonymous ? "" : data.donorName;
  return buildCreateDonationBodyFromKopecks({
    channel: transfer ? "transfer" : "online",
    isAnonymous: data.isAnonymous,
    donorName: name,
    fullName: transfer ? name : "",
    phone: data.isAnonymous ? "" : data.donorPhone,
    personalDataConsent: data.consentAccepted,
    regionSlug: data.region.slug,
    regionSource: data.region.source,
    antispam: data.antispam,
  }, data.amountKopecks, readStoredAttribution(clientId));
}

export function DonationAdapter({ regions }: { regions: readonly Region[] }) {
  const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [signedIn, setSignedIn] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [hasIntent, setHasIntent] = useState(false);
  const [consentRevision, setConsentRevision] = useState(0);
  const [sessionBusy, setSessionBusy] = useState(true);
  const [conditionsReady, setConditionsReady] = useState(true);
  const intent = useRef<{ hash: string; key: string } | null>(null);
  async function refresh() {
    const result = await donorRequest<Capabilities>("donations/capabilities");
    setCapabilities(formCapabilities(result));
    setConditionsReady(true); setNotice("");
    return result;
  }
  useEffect(() => {
    void donorRequest<Capabilities>("donations/capabilities").then(result => setCapabilities(formCapabilities(result)))
      .catch(() => setNotice("Условия автоплатежей временно недоступны"));
    const session = () => void donorRequest("donor/auth/session").then(() => setSignedIn(true)).catch(error => {
      if (error instanceof DonorRequestError && error.status === 401) {
        // Repeated anonymous session checks must not erase local consent.
        // A readiness transition resets it in useDonationForm.
        setSignedIn(false);
      }
    }).finally(() => setSessionBusy(false));
    session();
    window.addEventListener("focus", session);
    return () => window.removeEventListener("focus", session);
  }, []);
  async function submit(data: DonationSubmission) {
    if (data.donationType === "recurring") {
      if (!signedIn) { setAuthOpen(true); throw new Error("Подтвердите email, затем вернитесь к оформлению"); }
      if (!conditionsReady) throw new Error("Обновите условия автоплатежа перед оформлением");
      const conditions = capabilities.recurring;
      if (!conditions?.version || !conditions.dates) throw new Error("Обновите условия автоплатежа");
      const body = { amountKopecks: data.amountKopecks, frequency: data.frequency, method: "card", accepted: true,
        version: conditions.version, previewDate: conditions.dates[data.frequency], isAnonymous: data.isAnonymous,
        ...(data.isAnonymous || !data.donorName ? {} : { donorName: data.donorName }), attribution: readStoredAttribution() ?? undefined };
      const hash = JSON.stringify(body);
      if (intent.current && intent.current.hash !== hash) throw new Error("Результат предыдущего запроса уточняется. Проверьте автоплатежи в личном кабинете. Для безопасного повтора верните прежнюю сумму и график.");
      intent.current ??= { hash, key: crypto.randomUUID() };
      setHasIntent(true);
      let result: { redirectUrl: string };
      try { result = await donorRequest<{ redirectUrl: string }>("donations/recurring/checkout", body, intent.current.key); }
      catch (error) {
        if (error instanceof DonorRequestError && ["CONSENT_STALE", "AUTH_REQUIRED", "RECURRING_UNAVAILABLE"].includes(error.code)) {
          // These server rejections occur before creation; ambiguous network outcomes retain the key.
          intent.current = null; setHasIntent(false);
          setConsentRevision(value => value + 1);
          if (error.code === "AUTH_REQUIRED") { setSignedIn(false); setAuthOpen(true); }
          await refresh().catch(() => {});
        }
        throw error;
      }
      window.location.assign(result.redirectUrl); return {};
    }
    window.location.assign((await createDonation(bodyFor(data, await metrika.getClientId()))).redirectUrl);
    return {};
  }

  return <>
    <DonationForm regions={regions} capabilities={capabilities} submitDonation={submit} donorReady={signedIn && conditionsReady} consentRevision={consentRevision}
      donorAccess={sessionBusy ? <p role="status">Проверяем вход…</p> : signedIn ? <p role="status">{capabilities.recurring ? "Email подтверждён. Проверьте условия и подтвердите отдельное согласие." : "Email подтверждён. Личный кабинет доступен; оформление автоплатежей пока отключено."}</p> : <>
        <button type="button" className={`action-gold ${access.toggle}`} aria-expanded={authOpen} aria-controls="donation-email-access" onClick={() => setAuthOpen(!authOpen)}>{authOpen ? "Закрыть вход" : "Войти по email"}</button>
        <div id="donation-email-access" hidden={!authOpen}><DonorEmailAccess embedded onVerified={async () => {
          setConditionsReady(false); setConsentRevision(value => value + 1); setSignedIn(true); setAuthOpen(false);
          try { await refresh(); } catch { setConditionsReady(false); setNotice("Вход подтверждён. Не удалось обновить условия автоплатежа. Повторите загрузку условий."); }
        }} /></div>
      </>} />
    {notice && <p role="status">{notice}</p>}
    {!conditionsReady && <button type="button" className="btn btn-ghost" onClick={() => void refresh().catch(() => setNotice("Условия пока недоступны. Повторите попытку позже."))}>Обновить условия</button>}
    {hasIntent && <p role="status">Ответ об оформлении пока не подтверждён. Повтор с прежними условиями безопасен.</p>}
  </>;
}
