import { SECTION_IDS } from "@/lib/content";

/**
 * Первый контрол формы доната — на него ставит фокус кнопка «Помочь».
 * Выбранный пресет суммы: с него начинается форма. Если человек ввёл
 * свою сумму и пресет не выбран — поле суммы.
 */
const DONATION_FIRST_CONTROL = 'input[name="amount-preset"]:checked, input[name="amount"]';

/**
 * Если полей суммы нет (форма открыта на QR СБП — так по умолчанию, пока
 * Robokassa не подключена), фокус уходит на первый доступный контрол формы:
 * иначе он остаётся на нажатой кнопке, и клавиатура/скринридер теряют форму.
 */
const DONATION_ANY_CONTROL =
  'input:not([type="hidden"]):not([tabindex="-1"]):not([disabled]), button:not([tabindex="-1"]):not([disabled]), a[href], [tabindex="0"]';

/**
 * Событие «секцию нужно показать»: на телефоне секции свёрнуты в аккордеон
 * (`MobileAccordion`), и переход из меню должен её раскрыть.
 */
export const REVEAL_SECTION_EVENT = "reveal-section";

/** Ссылка на секцию главной, работающая с любой страницы сайта. */
export function sectionHref(id: string): string {
  return `/#${id}`;
}

/**
 * Плавная прокрутка к секции главной вместо перехода по ссылке.
 *
 * Возвращает `false`, если секции на странице нет (мы на «спасибо»
 * или «реквизитах») — тогда ссылка отрабатывает обычным переходом.
 *
 * Почему не просто `href="#id"`: переход на `/#id` с главной, открытой
 * по региональной ссылке `/?region=…`, выбросил бы параметр из адреса,
 * а с ним — атрибуцию доната к региону.
 */
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id);

  if (target === null) {
    return false;
  }

  target.dispatchEvent(new Event(REVEAL_SECTION_EVENT));

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);

  if (id === SECTION_IDS.donate) {
    const control =
      target.querySelector<HTMLElement>(DONATION_FIRST_CONTROL) ?? target.querySelector<HTMLElement>(DONATION_ANY_CONTROL);

    // preventScroll: иначе фокус дёрнет страницу посреди плавной прокрутки.
    control?.focus({ preventScroll: true });
  }

  return true;
}
