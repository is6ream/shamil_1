import { SECTION_IDS } from "@/lib/content";
import { scrollToSection } from "@/lib/scroll-to-section";

/**
 * Событие «откройте форму с такой суммой» — от чипов плашки «Текущий этап»
 * к форме доната. Тот же приём, что `REVEAL_SECTION_EVENT`: компоненты в
 * разных колонках страницы не делят состояние, форма сама слушает и сама
 * выбирает пресет своим же `selectPreset`.
 */
export const DONATION_REQUEST_EVENT = "donation-request";

export interface DonationRequestDetail {
  /** Сумма в рублях; `null` — «Другая сумма»: фокус в поле суммы. */
  readonly amountRubles: number | null;
}

/** Деталь события — внешние данные: событие может прислать кто угодно. */
export function readDonationRequest(event: Event): DonationRequestDetail | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail: unknown = event.detail;

  if (typeof detail !== "object" || detail === null || !("amountRubles" in detail)) {
    return null;
  }

  const { amountRubles } = detail;

  if (amountRubles === null) {
    return { amountRubles: null };
  }

  return typeof amountRubles === "number" && Number.isSafeInteger(amountRubles) && amountRubles > 0
    ? { amountRubles }
    : null;
}

/**
 * Прокрутить к форме и попросить её открыться с суммой.
 *
 * Сначала прокрутка (она же раскрывает секцию и ставит фокус в форму),
 * потом событие: форма переключается на «Через форму» и переставляет
 * фокус на выбранный пресет или поле суммы. `false` — формы на странице нет.
 */
export function requestDonation(amountRubles: number | null): boolean {
  if (!scrollToSection(SECTION_IDS.donate)) {
    return false;
  }

  document.getElementById(SECTION_IDS.donate)?.dispatchEvent(
    new CustomEvent<DonationRequestDetail>(DONATION_REQUEST_EVENT, { bubbles: true, detail: { amountRubles } }),
  );

  return true;
}
