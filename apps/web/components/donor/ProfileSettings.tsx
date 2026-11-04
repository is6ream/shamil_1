"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";

import { Checkbox } from "@/components/ui/Checkbox";
import field from "@/components/ui/field.module.css";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import type { Region } from "@/lib/api/types";
import { DONOR_PATHS } from "@/lib/donor/endpoints";
import { useDonorQuery } from "@/lib/donor/hooks";
import { donorClient, replaceDonorProfile, useDonorSession } from "@/lib/donor/session";
import type { DonorProfile, UpdateProfileBody } from "@/lib/donor/types";

import { DeleteAccountSection } from "./DeleteAccountSection";
import { EmailSection } from "./EmailSection";
import styles from "./ProfileSettings.module.css";
import { VkSection } from "./VkSection";

/** Россия — единственная страна, у которой в справочнике есть субъекты. */
const COUNTRY_WITH_SUBJECTS = "RU";

/** «Настройки»: личные данные, почта, VK, удаление аккаунта. */
export function ProfileSettings() {
  const session = useDonorSession("required");

  if (session.status !== "authenticated") {
    return null;
  }

  return (
    <>
      <h1 className={styles.title}>Настройки</h1>
      {/* key: после смены почты или привязки VK форма личных данных не сбрасывает правки. */}
      <PersonalDataForm key={session.profile.id} profile={session.profile} />
      <EmailSection profile={session.profile} />
      <VkSection profile={session.profile} />
      <DeleteAccountSection profile={session.profile} />
    </>
  );
}

interface Draft {
  readonly firstName: string;
  readonly lastName: string;
  readonly middleName: string;
  readonly phone: string;
  readonly countrySlug: string;
  readonly subjectSlug: string;
  readonly city: string;
  readonly showInFeed: boolean;
}

function draftOf(profile: DonorProfile, regions: readonly Region[]): Draft {
  const russia = regions.find((region) => region.type === "country" && region.code === COUNTRY_WITH_SUBJECTS);
  const isSubject = profile.region?.type === "subject";

  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    middleName: profile.middleName ?? "",
    phone: profile.phone ?? "",
    countrySlug: isSubject ? (russia?.slug ?? "") : (profile.region?.slug ?? ""),
    subjectSlug: isSubject ? (profile.region?.slug ?? "") : "",
    city: profile.city ?? "",
    showInFeed: profile.showInFeed,
  };
}

/** Телефон как его пишут люди → E.164: «+7 (917) 123-45-67» → «+79171234567». */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");

  return digits.startsWith("8") && digits.length === 11 ? `+7${digits.slice(1)}` : digits;
}

function bodyOf(draft: Draft): UpdateProfileBody {
  const region = draft.subjectSlug !== "" ? draft.subjectSlug : draft.countrySlug;

  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    middleName: draft.middleName,
    phone: normalizePhone(draft.phone),
    regionSlug: region === "" ? null : region,
    city: draft.city,
    showInFeed: draft.showInFeed,
  };
}

function PersonalDataForm({ profile }: { readonly profile: DonorProfile }) {
  const regions = useDonorQuery<readonly Region[]>(DONOR_PATHS.regions);

  if (regions.data === null && regions.error === null) {
    return <section className={`card ${styles.section}`} aria-busy="true" aria-label="Личные данные" />;
  }

  return <PersonalDataFields profile={profile} regions={regions.data ?? []} />;
}

function PersonalDataFields({ profile, regions }: { readonly profile: DonorProfile; readonly regions: readonly Region[] }) {
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile, regions));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [errors, setErrors] = useState<readonly string[]>([]);
  const countries = regions.filter((region) => region.type === "country");
  const subjects = [...regions.filter((region) => region.type === "subject")].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const country = countries.find((region) => region.slug === draft.countrySlug);
  const hasSubjects = country?.code === COUNTRY_WITH_SUBJECTS;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrors([]);

    try {
      const saved = await donorClient().request<DonorProfile>(DONOR_PATHS.me, { method: "PATCH", body: bodyOf(draft) });

      replaceDonorProfile(saved);
      setStatus("saved");
    } catch (error: unknown) {
      setErrors(error instanceof AdminApiError ? error.messages : [errorMessage(error)]);
      setStatus("idle");
    }
  }

  return (
    <form className={`card ${styles.section}`} onSubmit={handleSubmit} aria-labelledby={`${ids}-title`} noValidate>
      <h2 className={styles.heading} id={`${ids}-title`}>
        Личные данные
      </h2>
      <div className={styles.grid}>
        <TextInput id={`${ids}-last`} label="Фамилия" autoComplete="family-name" value={draft.lastName} onChange={(value) => set("lastName", value)} />
        <TextInput id={`${ids}-first`} label="Имя" autoComplete="given-name" value={draft.firstName} onChange={(value) => set("firstName", value)} />
        <TextInput
          id={`${ids}-middle`}
          label="Отчество"
          autoComplete="additional-name"
          value={draft.middleName}
          onChange={(value) => set("middleName", value)}
        />
        <TextInput
          id={`${ids}-phone`}
          label="Телефон"
          type="tel"
          autoComplete="tel"
          placeholder="+7 917 123-45-67"
          value={draft.phone}
          onChange={(value) => set("phone", value)}
        />
        <div>
          <label className={field.label} htmlFor={`${ids}-country`}>
            Страна
          </label>
          <select
            id={`${ids}-country`}
            className={field.input}
            value={draft.countrySlug}
            onChange={(event) => {
              setDraft((current) => ({ ...current, countrySlug: event.target.value, subjectSlug: "" }));
              setStatus("idle");
            }}
          >
            <option value="">Не указана</option>
            {countries.map((region) => (
              <option key={region.slug} value={region.slug}>
                {region.name}
              </option>
            ))}
          </select>
        </div>
        {hasSubjects ? (
          <div>
            <label className={field.label} htmlFor={`${ids}-subject`}>
              Регион
            </label>
            <select
              id={`${ids}-subject`}
              className={field.input}
              value={draft.subjectSlug}
              onChange={(event) => set("subjectSlug", event.target.value)}
            >
              <option value="">Не указан</option>
              {subjects.map((region) => (
                <option key={region.slug} value={region.slug}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <TextInput id={`${ids}-city`} label="Город" autoComplete="address-level2" value={draft.city} onChange={(value) => set("city", value)} />
      </div>
      <p className={field.hint}>Регион нужен для рейтинга землячеств на сайте — за свой регион хочется постараться.</p>

      <div className={styles.feed}>
        <Checkbox id={`${ids}-feed`} name="showInFeed" checked={draft.showInFeed} onChange={(value) => set("showInFeed", value)}>
          Показывать моё имя и регион в ленте пожертвований
        </Checkbox>
        {/* TODO(оферта): ссылка на пункт оферты о согласии на распространение ПДн —
            текст допишет заказчик. Пункта 7.3.1 (он из оферты mechet.ru) у нас нет. */}
        <p className={field.hint}>
          Это отдельное согласие на распространение персональных данных (ст. 10.1 152-ФЗ). Без него пожертвования в ленте
          подписаны «Анонимно». Если снять галочку, имя пропадёт и из уже опубликованных пожертвований. От неё зависит и
          галочка «анонимно» в форме пожертвования.
        </p>
      </div>

      {errors.length === 0 ? null : (
        <ul className={styles.errors} role="alert">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button className="btn btn-primary" type="submit" aria-busy={status === "saving"} disabled={status === "saved"}>
          {status === "saved" ? "Сохранено" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

interface TextInputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: "text" | "tel";
  readonly autoComplete?: string;
  readonly placeholder?: string;
}

function TextInput({ id, label, value, onChange, type = "text", autoComplete, placeholder }: TextInputProps) {
  return (
    <div>
      <label className={field.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={field.input}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        maxLength={120}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
