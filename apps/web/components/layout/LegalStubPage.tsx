import { PAGE_PENDING_TEXT } from "@/lib/content";

import { SimplePage } from "./SimplePage";

interface Props {
  readonly title: string;
}

/**
 * Юридическая страница до готового текста. Ссылки на неё уже стоят
 * в форме и футере — 404 на «Политике конфиденциальности» хуже честного
 * «текст готовится».
 *
 * Сейчас — только «Условия оплаты»: политика, cookie, согласие и оферта
 * опубликованы 21.10.2026 (lib/legal).
 *
 * TODO(заказчик): текст условий оплаты.
 */
export function LegalStubPage({ title }: Props) {
  return <SimplePage title={title} lede={PAGE_PENDING_TEXT} />;
}
