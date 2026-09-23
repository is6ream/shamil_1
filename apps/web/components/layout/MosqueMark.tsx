/**
 * Знак в шапке и футере: купол с полумесяцем, тем же линейным штрихом,
 * что и сцена первого экрана.
 *
 * TODO(заказчик): логотип в векторе — блокер из CLAUDE.md. До него стоит
 * этот знак; замена сведётся к подмене содержимого одного файла.
 */
export function MosqueMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20v-7a8 8 0 0 1 16 0v7" />
      <path d="M2 20h20" />
      <path d="M12 5V2.5" />
      <circle cx="12" cy="3.6" r="1.1" />
    </svg>
  );
}
