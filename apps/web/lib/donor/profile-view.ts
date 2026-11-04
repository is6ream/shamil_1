/**
 * Как показать профиль: имя, инициалы, «с нами с», безопасный возврат
 * после входа, тексты ответа VK. Чистые функции (`profile-view.test.ts`).
 */

import { CAMPAIGN_TIME_ZONE } from "@/lib/format";

import { PROFILE_PATHS } from "./endpoints";
import type { DonorProfile } from "./types";

type Names = Pick<DonorProfile, "firstName" | "lastName">;

/** «Ильдар Хасанов», только имя или `null`, если имени нет. */
export function displayName(profile: Names): string | null {
  const name = [profile.firstName, profile.lastName].filter((part): part is string => part !== null && part !== "");

  return name.length > 0 ? name.join(" ") : null;
}

/** Две буквы для аватара; без имени — первая буква почты или «?». */
export function initials(profile: Names & Pick<DonorProfile, "email">): string {
  const letters = [profile.firstName, profile.lastName]
    .map((part) => part?.trim().charAt(0) ?? "")
    .filter((letter) => letter !== "")
    .join("");

  if (letters !== "") {
    return letters.toUpperCase();
  }

  return profile.email?.charAt(0).toUpperCase() ?? "?";
}

/** «октября 2026» → «С нами с октября 2026». */
export function memberSinceLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: CAMPAIGN_TIME_ZONE })
    .formatToParts(new Date(iso));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `С нами с ${genitiveMonth(month)} ${year}`;
}

/** `Intl` в именительном падеже для формата без дня — «октябрь»; нам нужен «октября». */
function genitiveMonth(month: string): string {
  const map: Readonly<Record<string, string>> = {
    январь: "января",
    февраль: "февраля",
    март: "марта",
    апрель: "апреля",
    май: "мая",
    июнь: "июня",
    июль: "июля",
    август: "августа",
    сентябрь: "сентября",
    октябрь: "октября",
    ноябрь: "ноября",
    декабрь: "декабря",
  };

  return map[month.toLowerCase()] ?? month;
}

/**
 * Куда вернуть после входа: только путь этого сайта. `//evil.example`
 * и `https://…` — открытый редирект, их заменяем кабинетом. Бэкенд
 * то же проверяет у VK (CHECK на `return_to`), здесь — для входа по почте.
 */
export function safeReturnPath(path: string | null | undefined): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return PROFILE_PATHS.home;
  }

  return path.length > 512 ? PROFILE_PATHS.home : path;
}

/** Ответ колбэка VK в адресе: `?vk=error|taken|linked`. */
export type VkOutcome = "error" | "taken" | "linked";

export function readVkOutcome(value: string | null): VkOutcome | null {
  return value === "error" || value === "taken" || value === "linked" ? value : null;
}

export const VK_OUTCOME_MESSAGES: Readonly<Record<VkOutcome, string>> = {
  error: "Не получилось войти через VK. Попробуйте ещё раз или войдите по коду на почту.",
  taken: "Этот профиль VK уже привязан к другому кабинету.",
  linked: "VK привязан — теперь можно входить в один клик.",
};
