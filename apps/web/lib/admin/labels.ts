/**
 * Русские подписи значений API: статусы, способы, действия журнала.
 * Одно место — экраны не держат свои словари.
 */

import type { DonationStatus, ManualMethod, MediaUsageType, StageStatus } from "./types";

export const DONATION_STATUS_LABELS: Readonly<Record<DonationStatus, string>> = {
  pending: "Ожидает",
  paid: "Оплачено",
  failed: "Не прошло",
};

/** Способы оплаты из `donation.method`; неизвестный выводится как есть. */
export const METHOD_LABELS: Readonly<Record<string, string>> = {
  sbp: "СБП",
  card: "Карта",
  sberpay: "SberPay",
  tpay: "T-Pay",
  bank_transfer: "Перевод по реквизитам",
  cash: "Наличные",
};

export const MANUAL_METHOD_LABELS: Readonly<Record<ManualMethod, string>> = {
  cash: "Наличные",
  bank_transfer: "Перевод по реквизитам",
  sbp: "СБП",
};

export const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  manual: "Вручную / по реквизитам",
  robokassa: "Robokassa",
};

export function methodLabel(method: string | null): string {
  return method === null ? "—" : (METHOD_LABELS[method] ?? method);
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export const STAGE_STATUS_LABELS: Readonly<Record<StageStatus, string>> = {
  done: "Выполнено",
  current: "Идёт сейчас",
  upcoming: "Впереди",
};

export const USAGE_TYPE_LABELS: Readonly<Record<MediaUsageType, string>> = {
  gallery_item: "Галерея",
  video_link: "Видео (постер)",
  construction_stage: "Ход стройки",
  news_post: "Новости (обложка)",
  content_block: "Тексты сайта",
};

/** Раздел админки, где убирают файл из использования. */
export const USAGE_TYPE_HREFS: Readonly<Record<MediaUsageType, string>> = {
  gallery_item: "/admin/gallery",
  video_link: "/admin/video",
  construction_stage: "/admin/stages",
  news_post: "/admin/news",
  content_block: "/admin/content",
};

/** Действия журнала (API.md §6) по-русски. */
export const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  "auth.login": "Вход в админку",
  "auth.password_change": "Смена своего пароля",
  "admin_user.create": "Создан пользователь",
  "admin_user.update": "Изменён пользователь",
  "admin_user.reset_password": "Сброшен пароль пользователя",
  "media.upload": "Загружено фото",
  "media.update": "Изменено фото",
  "media.delete": "Удалено фото",
  "gallery.create": "Фото добавлено в галерею",
  "gallery.update": "Изменено фото галереи",
  "gallery.delete": "Фото убрано из галереи",
  "gallery.reorder": "Изменён порядок галереи",
  "video.create": "Добавлено видео",
  "video.update": "Изменено видео",
  "video.delete": "Удалено видео",
  "video.reorder": "Изменён порядок видео",
  "content.update": "Изменены тексты сайта",
  "stage.create": "Добавлен этап стройки",
  "stage.update": "Изменён этап стройки",
  "stage.delete": "Удалён этап стройки",
  "stage.reorder": "Изменён порядок этапов",
  "news.create": "Создана новость",
  "news.update": "Изменена новость",
  "news.publish": "Новость опубликована",
  "news.unpublish": "Новость снята с публикации",
  "news.delete": "Удалена новость",
  "donation.confirm": "Подтверждён перевод",
  "donation.manual_create": "Внесено поступление вручную",
  "donation.export": "Выгрузка пожертвований в CSV",
  "donation.amount_mismatch": "Сумма оплаты не совпала с заказом",
  "campaign.update_goal": "Изменена общая цель сбора",
  "campaign.monthly_goal_create": "Создана цель месяца",
  "campaign.monthly_goal_update": "Изменена цель месяца",
  "campaign.monthly_goal_delete": "Удалена цель месяца",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** Группы действий для фильтра журнала: префикс `группа.*`. */
export const AUDIT_ACTION_GROUPS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "auth.*", label: "Вход и пароль" },
  { value: "admin_user.*", label: "Пользователи" },
  { value: "donation.*", label: "Пожертвования" },
  { value: "campaign.*", label: "Цели сбора" },
  { value: "content.*", label: "Тексты сайта" },
  { value: "stage.*", label: "Ход стройки" },
  { value: "news.*", label: "Новости" },
  { value: "media.*", label: "Фото" },
  { value: "gallery.*", label: "Галерея" },
  { value: "video.*", label: "Видео" },
];

/** Типы объектов журнала. */
export const AUDIT_ENTITY_LABELS: Readonly<Record<string, string>> = {
  admin_user: "Пользователь",
  donation: "Пожертвование",
  campaign: "Сбор",
  campaign_monthly_goal: "Цель месяца",
  content_block: "Тексты сайта",
  construction_stage: "Этап стройки",
  news_post: "Новость",
  media_asset: "Фото",
  gallery_item: "Галерея",
  video_link: "Видео",
};

export function auditEntityLabel(entityType: string | null): string {
  return entityType === null ? "—" : (AUDIT_ENTITY_LABELS[entityType] ?? entityType);
}
