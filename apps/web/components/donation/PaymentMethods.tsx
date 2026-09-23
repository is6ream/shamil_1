import type { OnlineMethodId } from "./donation-form.model";

interface MethodOption {
  readonly id: OnlineMethodId;
  readonly label: string;
  /** Подпись справа: «без комиссии», страна, состояние подключения. */
  readonly tag?: string;
  /**
   * Способ ещё не подключён. Выбрать его нельзя — иначе человек уходит
   * платить тем, чего у нас нет, и возвращается разочарованным.
   */
  readonly isPending?: boolean;
}

/**
 * СБП стоит первым: нулевая комиссия для плательщика и оплата в два тапа,
 * в живой ленте референса он лидирует. Референс ставит первой карту —
 * это его ошибка, не копируем.
 */
const RUSSIAN_METHODS: readonly MethodOption[] = [
  { id: "sbp", label: "СБП", tag: "без комиссии" },
  { id: "card", label: "Картой онлайн" },
  { id: "sberpay", label: "SberPay" },
  { id: "tpay", label: "T-Pay" },
];

/**
 * Kaspi и Mbank требует ТЗ — без них «нет Каспи и Mbank, поэтому и бабла
 * мало», главная претензия заказчика к референсу. Но договоров с банками
 * ещё нет (docs/payments-setup.md), а Robokassa их не закрывает. Показываем
 * честно: способ заявлен, приём откроется после подключения.
 *
 * TODO(заказчик): статус договоров с Kaspi (KZ) и Mbank (KG).
 */
const FOREIGN_METHODS: readonly MethodOption[] = [
  { id: "kaspi", label: "Kaspi Bank", tag: "Казахстан · подключается", isPending: true },
  { id: "mbank", label: "Mbank", tag: "Кыргызстан · подключается", isPending: true },
];

interface Props {
  readonly value: OnlineMethodId;
  readonly onChange: (method: OnlineMethodId) => void;
}

function MethodRow({
  option,
  checked,
  onChange,
}: {
  readonly option: MethodOption;
  readonly checked: boolean;
  readonly onChange: (method: OnlineMethodId) => void;
}) {
  return (
    <label className="pay" aria-disabled={option.isPending === true ? "true" : undefined}>
      <input
        className="sr-only"
        type="radio"
        name="online-method"
        value={option.id}
        checked={checked}
        disabled={option.isPending === true}
        onChange={() => {
          onChange(option.id);
        }}
      />
      <span className="dot" />
      {option.label}
      {option.tag === undefined ? null : <span className="tag">{option.tag}</span>}
    </label>
  );
}

/**
 * Способы оплаты внутри онлайн-канала.
 *
 * Важное про архитектуру: выбранный способ бэкенду НЕ передаётся — в
 * `CreateDonationDto` поля метода нет, а СБП, SberPay, T-Pay и карта это
 * способы внутри Robokassa, и выбирает их сам плательщик на её странице.
 * Список здесь отвечает на вопрос «а чем вообще можно заплатить»
 * до перехода, и заодно задаёт ожидание, что на той стороне будет СБП.
 */
export function PaymentMethods({ value, onChange }: Props) {
  return (
    <fieldset className="fieldset-plain">
      <legend className="field-label">Способ оплаты</legend>

      {RUSSIAN_METHODS.map((option) => (
        <MethodRow
          key={option.id}
          option={option}
          checked={value === option.id}
          onChange={onChange}
        />
      ))}

      <div className="divider-label">Из других стран</div>

      {FOREIGN_METHODS.map((option) => (
        <MethodRow
          key={option.id}
          option={option}
          checked={value === option.id}
          onChange={onChange}
        />
      ))}

      <p className="micro">
        Способ можно выбрать и на странице оплаты. Комиссия платёжных агентов уже включена
        в сумму — дополнительных списаний не производится.
      </p>
    </fieldset>
  );
}
