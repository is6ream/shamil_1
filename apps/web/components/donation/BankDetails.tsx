import Image from "next/image";

import { BANK_DETAILS, ORGANIZATION, hasBankDetails } from "@/lib/organization";

import styles from "./BankDetails.module.css";

/**
 * Сторона QR-кода. `unoptimized`: картинку выдаёт банк готовой, и пережимать
 * её нельзя — потеря контраста ломает распознавание камерой.
 */
const QR_SIZE_PX = 180;

interface Props {
  /**
   * Номер заказа. Показывается как назначение платежа: по нему админ
   * сопоставляет поступление в выписке с донатом.
   */
  readonly orderId?: string;
}

interface RowProps {
  readonly label: string;
  readonly value: string | null;
}

function Row({ label, value }: RowProps) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value ?? <span className="muted">уточняется</span>}</dd>
    </div>
  );
}

/**
 * Реквизиты для перевода вручную.
 *
 * Это постоянный способ оплаты, а не заглушка: часть жертвователей
 * принципиально не платит картой онлайн, и так же устроен референс.
 * Плюс это рабочий запасной путь всего проекта — мерчант-аккаунт Robokassa
 * проходит модерацию неделями, и если он не активирован к сроку, сбор
 * всё равно принимает деньги.
 *
 * Пока реквизитов нет, компонент честно говорит об этом и не печатает
 * правдоподобных цифр: номер счёта из воздуха — это деньги в никуда.
 */
export function BankDetails({ orderId }: Props) {
  const isReady = hasBankDetails();

  return (
    <div className={styles.wrap}>
      {isReady ? null : (
        <p className={styles.pending}>
          Реквизиты расчётного счёта публикуются после подтверждения заказчиком.
          Пока оплатите онлайн — или напишите нам, и мы пришлём реквизиты ответом.
        </p>
      )}

      <dl className={styles.list}>
        <Row label="Получатель" value={ORGANIZATION.legalName} />
        <Row label="ИНН" value={ORGANIZATION.inn} />
        <Row label="КПП" value={BANK_DETAILS.kpp} />
        <Row label="Расчётный счёт" value={BANK_DETAILS.accountNumber} />
        <Row label="Банк" value={BANK_DETAILS.bankName} />
        <Row label="БИК" value={BANK_DETAILS.bik} />
        <Row label="Корр. счёт" value={BANK_DETAILS.correspondentAccount} />
        {orderId === undefined ? null : (
          <Row label="Назначение платежа" value={`Пожертвование, заказ ${orderId}`} />
        )}
      </dl>

      {BANK_DETAILS.sbpQrUrl === null ? (
        <p className="micro">QR-код СБП появится здесь вместе с реквизитами.</p>
      ) : (
        <Image
          className={styles.qr}
          src={BANK_DETAILS.sbpQrUrl}
          alt="QR-код СБП для перевода пожертвования"
          width={QR_SIZE_PX}
          height={QR_SIZE_PX}
          unoptimized
        />
      )}
    </div>
  );
}
