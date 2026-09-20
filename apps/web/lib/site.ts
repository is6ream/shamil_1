/** Общие константы сайта: название, слоган, адреса. */

export const SITE_NAME = "Мечеть «Шамиль»";

/** Слоган из ТЗ. Меняется только вместе с ТЗ. */
export const SLOGAN = "построй себе дом в раю за 100 ₽";

export const SITE_DESCRIPTION =
  "Сбор на строительство мечети «Шамиль» в Уфе. Принимаем пожертвования от 100 ₽, " +
  "показываем ход стройки и рейтинг поддерживающих регионов.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Базовый адрес бэкенда. Публичная переменная — секретов здесь быть не может. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Цель сбора из ТЗ, в рублях. Валюта на подтверждении у заказчика. */
export const CAMPAIGN_GOAL_RUBLES = 240_000_000;

/** Минимальный донат, ₽ — совпадает со слоганом. */
export const MIN_DONATION_RUBLES = 100;
