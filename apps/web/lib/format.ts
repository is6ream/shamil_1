/**
 * Числа и слова вокруг них.
 *
 * Группировка разрядов и склонение живут здесь, а не в компонентах:
 * «1204 человек уже помогли» на первом экране сбора — это не опечатка,
 * а испорченное первое впечатление.
 */

/** Неразрывный пробел между разрядами: сумма не переносится по строкам. */
export const GROUP_SEPARATOR = "\u00A0";

/** «12840000» → «12 840 000». Работает и со строкой из BigInt. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/** Целое число с разделителями разрядов. */
export function formatCount(value: number): string {
  return groupDigits(Math.trunc(value).toString());
}

/**
 * Русское склонение по числу: `plural(1204, ["человек", "человека", "людей"])`.
 * Формы — для 1, 2 и 5: «1 человек», «2 человека», «5 людей».
 */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const absolute = Math.abs(Math.trunc(count)) % 100;
  const tail = absolute % 10;

  if (absolute > 10 && absolute < 20) {
    return forms[2];
  }

  if (tail > 1 && tail < 5) {
    return forms[1];
  }

  if (tail === 1) {
    return forms[0];
  }

  return forms[2];
}

/** Число вместе со склонённым словом: «1 204 человека». */
export function pluralize(count: number, forms: readonly [string, string, string]): string {
  return `${formatCount(count)}${GROUP_SEPARATOR}${plural(count, forms)}`;
}

/**
 * Часовой пояс сбора — уфимский.
 *
 * Задан явно, и это не придирка: страницы рендерятся на сервере, а время
 * форматируется ещё раз при гидратации в браузере. Сервер в UTC, донатер
 * в Москве или Алматы — и «14:32» в разметке расходится с «16:32» после
 * гидратации. Одна фиксированная зона снимает расхождение, а заодно делает
 * ленту сопоставимой: все записи в ней в одном времени, времени стройки.
 */
export const CAMPAIGN_TIME_ZONE = "Asia/Yekaterinburg";

/** «14:32» по времени сбора. */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CAMPAIGN_TIME_ZONE,
  });
}

/** «18 сентября» — без года: строка про свежесть, а не про документ. */
export function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: CAMPAIGN_TIME_ZONE,
  });
}

/** «21.09» по времени сбора. */
export function formatDayMonthNumeric(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: CAMPAIGN_TIME_ZONE,
  });
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/**
 * Календарный день по времени сбора, «2026-09-21». Локаль `en-CA` выбрана
 * ради формата ГГГГ-ММ-ДД — строки такого вида сравниваются как даты.
 */
function campaignDayKey(time: number): string {
  return new Date(time).toLocaleDateString("en-CA", { timeZone: CAMPAIGN_TIME_ZONE });
}

/**
 * «Сегодня», «Вчера» или «21.09» — день поступления относительно `now`.
 *
 * `now` передаётся явно, а не берётся внутри: на сервере и в браузере
 * «сейчас» разное, и относительная подпись обязана считаться там же, где
 * рендерится, — иначе hydration mismatch. См. `useRelativeDays`.
 */
export function formatRelativeDay(iso: string, now: number): string {
  const day = campaignDayKey(new Date(iso).getTime());

  if (day === campaignDayKey(now)) {
    return "Сегодня";
  }

  // В Екатеринбургском поясе нет перехода на летнее время: сутки всегда 24 ч.
  if (day === campaignDayKey(now - MS_IN_DAY)) {
    return "Вчера";
  }

  return formatDayMonthNumeric(iso);
}

/**
 * Человекочитаемые названия способов оплаты для ленты. Ключи — значения
 * `donation.method` бэкенда как есть (docs/api-gaps.md §5).
 */
const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  sbp: "СБП",
  card: "Картой",
  sberpay: "SberPay",
  tpay: "T-Pay",
  bank_transfer: "Перевод",
  recurring: "Ежемесячно",
  cash: "Наличными",
};

/** `null` — способ неизвестен или новый: строка ленты выводится без него. */
export function paymentMethodLabel(method: string | null): string | null {
  if (method === null) {
    return null;
  }

  return PAYMENT_METHOD_LABELS[method] ?? null;
}
