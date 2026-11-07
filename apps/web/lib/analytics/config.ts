/**
 * Настройки Яндекс Метрики из окружения.
 *
 * `NEXT_PUBLIC_*` вшиваются в бандл при **сборке**: поменять номер счётчика
 * без пересборки фронта нельзя. Поэтому обращения — буквальные
 * `process.env.NEXT_PUBLIC_…`: только такие Next подставляет на этапе сборки.
 */

export interface MetrikaConfig {
  /** `null` — Метрика выключена: счётчик не грузится, все вызовы — no-op. */
  readonly counterId: number | null;
  /** Грузить счётчик только после согласия на аналитические cookie. */
  readonly requireConsent: boolean;
  readonly webvisor: boolean;
}

export interface RawMetrikaEnv {
  readonly counterId: string | undefined;
  readonly enabled: string | undefined;
  readonly requireConsent: string | undefined;
  readonly webvisor: string | undefined;
}

const COUNTER_ID_PATTERN = /^[1-9][0-9]{0,11}$/;

/**
 * Метрика включается только явно: `NEXT_PUBLIC_YM_ENABLED=true` и корректный
 * номер. Локальная разработка и превью не засоряют боевой счётчик.
 * Согласие и Вебвизор — включены, пока их явно не выключили.
 */
export function resolveMetrikaConfig(raw: RawMetrikaEnv): MetrikaConfig {
  const id = raw.counterId?.trim() ?? "";
  const isEnabled = raw.enabled?.trim() === "true" && COUNTER_ID_PATTERN.test(id);

  return {
    counterId: isEnabled ? Number(id) : null,
    requireConsent: raw.requireConsent?.trim() !== "false",
    webvisor: raw.webvisor?.trim() !== "false",
  };
}

export const METRIKA_CONFIG: MetrikaConfig = resolveMetrikaConfig({
  counterId: process.env.NEXT_PUBLIC_YM_COUNTER_ID,
  enabled: process.env.NEXT_PUBLIC_YM_ENABLED,
  requireConsent: process.env.NEXT_PUBLIC_YM_REQUIRE_CONSENT,
  webvisor: process.env.NEXT_PUBLIC_YM_WEBVISOR,
});
