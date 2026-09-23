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
