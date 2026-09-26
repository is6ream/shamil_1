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
 * TODO(заказчик): тексты политики, cookie, согласия на ПДн и условий оплаты
 * (обязательны по 152-ФЗ, готовятся вместе с юридической частью).
 */
export function LegalStubPage({ title }: Props) {
  return <SimplePage title={title} lede={PAGE_PENDING_TEXT} />;
}
