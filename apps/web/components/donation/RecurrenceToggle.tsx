/**
 * «Единоразовое / Автоплатёж».
 *
 * Автоплатёж вне MVP и остаётся задизейбленным: он требует токенизации
 * карты, SMS-подтверждения и личного кабинета — это дни работы, а не часы
 * (CONTEXT.md §5). У референса 76 активных подписок, то есть вещь рабочая,
 * и вернуться к ней стоит сразу после запуска.
 *
 * Почему показываем вообще, а не прячем: заказчик назвал автоплатёж одной
 * из главных целей сайта. Видимая пометка «скоро» — честный ответ на
 * ожидание; отсутствие переключателя читалось бы как «забыли».
 */
export function RecurrenceToggle() {
  return (
    <fieldset className="fieldset-plain">
      <legend className="field-label">Периодичность</legend>
      <div className="chips">
        <label className="chip">
          <input className="sr-only" type="radio" name="recurrence" value="once" defaultChecked />
          Единоразовое
        </label>

        <label className="chip" aria-disabled="true">
          <input className="sr-only" type="radio" name="recurrence" value="monthly" disabled />
          Ежемесячно <span className="tag">скоро</span>
        </label>
      </div>
    </fieldset>
  );
}
