"use client";

import { useEffect, useSyncExternalStore } from "react";

import { createAdminClient } from "@/lib/admin/api-client";
import type { AdminClient } from "@/lib/admin/api-client";
import { AdminApiError, errorMessage } from "@/lib/admin/errors";
import { API_URL } from "@/lib/site";

import { DONOR_AUTH_PATHS, DONOR_PATHS, DONOR_REFRESH_LOCK } from "./endpoints";
import { hasDonorHint, setDonorHint } from "./hint";
import type { DonorProfile, DonorSessionResponse, LoginMethods } from "./types";

/**
 * Сессия кабинета жертвователя на клиенте — одна на вкладку.
 *
 * Как у админки (D-05): access только в памяти этого модуля, refresh —
 * httpOnly-cookie API на пути `/api/donor/auth`. Отличие одно: кабинет
 * нужен и вне `/profile` — форма доната подставляет имя и шлёт Bearer.
 * Делать refresh для каждого посетителя главной — лишний запрос от тысяч
 * людей, у которых кабинета нет. Поэтому вне кабинета сессия
 * восстанавливается, только если в этом браузере уже входили: метка
 * в `localStorage`. Метка — не секрет и не токен, только «стоит спросить API».
 */

export type DonorSessionState =
  /** Не проверяли: вне кабинета и метки входа нет. */
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  /** Проверить не удалось (лимит, сбой, сеть) — сессия, возможно, жива. */
  | { readonly status: "unavailable"; readonly message: string }
  | { readonly status: "authenticated"; readonly profile: DonorProfile };

const IDLE: DonorSessionState = { status: "idle" };

let state: DonorSessionState = IDLE;
let client: AdminClient | null = null;
let restoring: Promise<void> | null = null;
let methods: Promise<LoginMethods> | null = null;
const listeners = new Set<() => void>();

function setState(next: DonorSessionState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

function markAnonymous(): void {
  setDonorHint(false);
  setState({ status: "anonymous" });
}

/** Клиент создаётся в браузере при первом обращении. */
export function donorClient(): AdminClient {
  client ??= createAdminClient({
    baseUrl: API_URL,
    refreshPath: DONOR_AUTH_PATHS.refresh,
    refreshLockName: DONOR_REFRESH_LOCK,
    onSessionExpired: markAnonymous,
  });

  return client;
}

async function loadProfile(): Promise<DonorProfile> {
  return donorClient().request<DonorProfile>(DONOR_PATHS.me);
}

async function doRestore(): Promise<void> {
  setState({ status: "loading" });

  try {
    if (!(await donorClient().refresh())) {
      markAnonymous();
      return;
    }

    setDonorHint(true);
    setState({ status: "authenticated", profile: await loadProfile() });
  } catch (error: unknown) {
    if (error instanceof AdminApiError && error.status === 401) {
      markAnonymous();
      return;
    }

    setState({ status: "unavailable", message: errorMessage(error) });
  }
}

/**
 * Восстановить сессию. `force` — в кабинете: туда приходят и после входа
 * через VK, когда метки ещё нет, а cookie уже стоит.
 */
export function restoreDonorSession(force: boolean): Promise<void> {
  if (state.status === "authenticated" || state.status === "loading") {
    return restoring ?? Promise.resolve();
  }

  if (!force && (state.status === "anonymous" || !hasDonorHint())) {
    if (state.status === "idle") {
      setState({ status: "anonymous" });
    }

    return Promise.resolve();
  }

  restoring ??= doRestore().finally(() => {
    restoring = null;
  });

  return restoring;
}

/** Вход по коду прошёл: токен в память, профиль — в состояние. */
export async function completeDonorLogin(session: DonorSessionResponse): Promise<void> {
  donorClient().setAccessToken(session.accessToken);
  setDonorHint(true);
  setState({ status: "authenticated", profile: await loadProfile() });
}

export function replaceDonorProfile(profile: DonorProfile): void {
  setState({ status: "authenticated", profile });
}

export async function reloadDonorProfile(): Promise<void> {
  replaceDonorProfile(await loadProfile());
}

/**
 * Выход с этого устройства. Локально выходим в любом случае: держать
 * человека в кабинете из-за сбоя сети нельзя, а cookie без access
 * бесполезна до следующего входа.
 */
export async function signOutDonor(): Promise<void> {
  try {
    await donorClient().request(DONOR_AUTH_PATHS.logout, { method: "POST", skipAuthRetry: true });
  } catch {
    // См. выше: выход локальный, даже если сервер не ответил.
  }

  donorClient().setAccessToken(null);
  markAnonymous();
}

/** Аккаунт удалён: сервер уже отозвал все сессии. */
export function forgetDonorSession(): void {
  donorClient().setAccessToken(null);
  markAnonymous();
}

/** Какие кнопки показать в окне входа. Ошибка — только почта. */
export function loadLoginMethods(): Promise<LoginMethods> {
  methods ??= donorClient()
    .request<LoginMethods>(DONOR_AUTH_PATHS.methods, { skipAuthRetry: true })
    .catch(() => {
      methods = null;
      return { email: true, vk: false };
    });

  return methods;
}

/**
 * Свежий Bearer для `POST /donations`: человек мог заполнять форму дольше
 * жизни access (15 мин). Не вошёл или refresh не удался — `null`, и донат
 * уходит без привязки: платёж важнее статистики.
 */
export async function donationAccessToken(): Promise<string | null> {
  if (state.status !== "authenticated") {
    return null;
  }

  try {
    return (await donorClient().refresh()) ? donorClient().getAccessToken() : null;
  } catch {
    return null;
  }
}

/** Состояние вне React — для формы доната, которая грузит этот модуль лениво. */
export function currentDonorSession(): DonorSessionState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Состояние сессии. `required` — страницы кабинета: проверяем всегда.
 * `passive` — остальной сайт: только если в этом браузере уже входили.
 */
export function useDonorSession(mode: "required" | "passive"): DonorSessionState {
  const current = useSyncExternalStore(subscribe, () => state, () => IDLE);

  useEffect(() => {
    void restoreDonorSession(mode === "required");
  }, [mode]);

  return current;
}
