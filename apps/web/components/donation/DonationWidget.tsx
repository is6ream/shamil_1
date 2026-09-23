import type { Campaign, Region } from "@/lib/api/types";

import { DonationForm } from "./DonationForm";
import { WidgetStats } from "./WidgetStats";

interface Props {
  readonly campaign: Campaign;
  readonly regions: readonly Region[];
}

/**
 * Правая колонка целиком: цифры сбора и форма.
 *
 * Серверный компонент — клиентским становится только сама форма. Данные
 * приходят пропсами сверху, поэтому виджет одинаково работает и в правой
 * колонке десктопа, и третьим блоком мобильной раскладки.
 */
export function DonationWidget({ campaign, regions }: Props) {
  return (
    <>
      <WidgetStats campaign={campaign} />
      <DonationForm regions={regions} />
    </>
  );
}
