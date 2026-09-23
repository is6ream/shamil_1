/**
 * Иллюстрация блока «Цени, пока не потерял»: песок из верхней колбы
 * пересыпался вниз и сложился в очертание мечети. Время утекает в любом
 * случае — вопрос в том, останется ли после него что-нибудь.
 *
 * Нарисована тем же штрихом, что и сцена первого экрана: блок рифмуется
 * с ним, а не спорит. Здесь была запланирована AI-картинка — от неё
 * отказались, растр рядом с линейной графикой читается как вставка
 * из другого проекта.
 *
 * Картинка намеренно не опирается на текст хадиса: он ещё не выверен
 * имамом, и если формулировка изменится, переделывать её не придётся.
 */
export function HourglassScene() {
  return (
    <div className="stage-time">
      <div className="glow" />
      <svg
        className="art art-time"
        viewBox="0 0 400 300"
        role="img"
        aria-label="Песочные часы: песок из верхней колбы пересыпался вниз и сложился в очертание мечети"
      >
        <defs>
          {/* Песок обрезается внутренним объёмом часов, а не рисуется
              отдельными кривыми: иначе его края не совпадают со стеклом
              и он выглядит блином поверх картинки. */}
          <clipPath id="hourglass-clip">
            <path
              d="M196 150 C196 120 132 108 132 46 H268 C268 108 204 120 204 150
                 C204 180 268 192 268 254 H132 C132 192 196 180 196 150 Z"
            />
          </clipPath>
        </defs>

        <g clipPath="url(#hourglass-clip)">
          <rect className="sand" x="100" y="92" width="200" height="66" />
          <rect className="sand" x="100" y="240" width="200" height="22" />
        </g>
        <path className="stroke thin" d="M146 92 H254" />
        <path className="stroke thin" d="M138 240 H262" />

        <path className="stroke" d="M120 46 H280" opacity=".5" />
        <path className="stroke" d="M120 254 H280" opacity=".5" />
        <path className="stroke" d="M132 46 C132 108 196 120 196 150 C196 180 132 192 132 254" />
        <path className="stroke" d="M268 46 C268 108 204 120 204 150 C204 180 268 192 268 254" />

        {/* Струя и три крупинки: время · молодость · здоровье */}
        <path className="stroke thin stream" d="M200 153 V172" />
        <circle className="stroke grain" cx="200" cy="156" r="2.8" />
        <circle className="stroke grain" cx="197" cy="162" r="2.2" />
        <circle className="stroke grain" cx="202" cy="168" r="1.8" />

        {/* То, что утекло, но не потерялось. Полумесяц обязателен: без него
            купол с михрабом и двумя минаретами читается как арка
            с фонарями, а не как мечеть. */}
        <g className="sand-mosque">
          <path className="stroke" d="M176 240 v-18 a24 24 0 0 1 48 0 v18" />
          <path className="stroke" d="M192 240 v-13 a8 8 0 0 1 16 0 v13" />
          <path className="stroke" d="M162 240 v-24" />
          <path className="stroke" d="M238 240 v-24" />
          <circle className="stroke" cx="162" cy="211" r="4" />
          <circle className="stroke" cx="238" cy="211" r="4" />
          <path className="stroke" d="M150 240 H250" />
          <path className="stroke" d="M200 180 a11 11 0 1 0 8 18 a8 8 0 1 1 -8 -18" />
        </g>
      </svg>
    </div>
  );
}
