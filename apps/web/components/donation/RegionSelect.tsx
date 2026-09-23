import type { Region } from "@/lib/api/types";

interface Props {
  readonly regions: readonly Region[];
  readonly value: string;
  readonly onChange: (slug: string) => void;
  /** Регион пришёл из ссылки `/{код}/` — подпись под полем другая. */
  readonly isFromLink: boolean;
}

const NOT_SPECIFIED = "";

/**
 * Селектор «Откуда вы?» — второй канал атрибуции региона.
 *
 * Это место, где референс провалился: единственный способ попасть в его
 * рейтинг — прийти по региональной ссылке, и в результате 93% денег
 * не попали ни в одну строку. Один лишний клик поднимает атрибуцию
 * с ~7% почти до 100%.
 *
 * Поле необязательное: донат без региона обязан проходить — платёж важнее
 * статистики. Регион по IP не определяем: VPN и роуминг ломают это в первый
 * же день, а ошибочная строка в публичном рейтинге хуже пустой.
 */
export function RegionSelect({ regions, value, onChange, isFromLink }: Props) {
  const countries = regions.filter((region) => region.type === "country");
  const subjects = regions.filter((region) => region.type === "subject");

  return (
    <>
      <label className="field-label" htmlFor="donation-region">
        Откуда вы?
      </label>
      <select
        className="input"
        id="donation-region"
        name="regionSlug"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value={NOT_SPECIFIED}>Не указывать</option>

        {countries.length === 0 ? null : (
          <optgroup label="Страны">
            {countries.map((region) => (
              <option key={region.slug} value={region.slug}>
                {region.name}
              </option>
            ))}
          </optgroup>
        )}

        {subjects.length === 0 ? null : (
          <optgroup label="Регионы России">
            {subjects.map((region) => (
              <option key={region.slug} value={region.slug}>
                {region.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <p className="micro">
        {isFromLink
          ? "Регион подставлен из ссылки, по которой вы пришли. Его можно поменять."
          : "Ваше пожертвование поднимет строку земляков в рейтинге регионов."}
      </p>
    </>
  );
}
