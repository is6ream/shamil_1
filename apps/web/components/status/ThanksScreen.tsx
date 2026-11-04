"use client";

import Link from "next/link";

import { HandsScene } from "@/components/hero/HandsScene";
import { ShareLinks } from "@/components/share/ShareLinks";
import { kopecksToRubDisplay } from "@/lib/money";

import { PollingPhrases } from "./PollingPhrases";
import styles from "./ThanksScreen.module.css";
import { useDonationStatus } from "./useDonationStatus";

interface Props {
  /** `null`, если в адресе нет `order_id` — например, зашли по закладке. */
  readonly orderId: string | null;
}

function ShareBox({ title }: { readonly title: string }) {
  return (
    <div className={styles.shareBox}>
      {/* «Расскажите о сборе», а не «я пожертвовал»: блок 9 главной
          построен на том, что садака — скрытое поклонение, и чекбокс
          анонимности включён по умолчанию. Репостится сбор, не поступок. */}
      <h2>{title}</h2>
      <p className={styles.lede}>
        Один репост в земляческий чат приводит больше, чем десять просмотров рекламы
      </p>
      <ShareLinks highlightFirst />
    </div>
  );
}

function OrderLine({ orderId, hint }: { readonly orderId: string; readonly hint: string }) {
  return (
    <p className={styles.order}>
      Номер платежа <b>{orderId}</b> — {hint}
      <br />
      <Link className={styles.back} href="/">
        Вернуться к сбору
      </Link>
    </p>
  );
}

/**
 * Экран после оплаты.
 *
 * Опрашивает статус заказа 3 с × 10, потому что вебхук провайдера
 * регулярно приходит позже пользовательского редиректа. По истечении
 * тридцати секунд донат НЕ считается неуспешным — это место, где мы
 * обязаны быть лучше референса: там честной формулировки нет.
 */
export function ThanksScreen({ orderId }: Props) {
  const { phase, status, error, retry } = useDonationStatus(orderId);

  if (orderId === null) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Здесь показывается статус платежа</h1>
        <p className={styles.lede}>
          Ссылка пришла без номера заказа, поэтому проверить платёж здесь не удалось.
          Если списание уже произошло, не платите повторно. Сохраните подтверждение
          банка и обратитесь к организаторам сбора для сверки.
        </p>
        <div className={styles.row}>
          <Link className="btn btn-primary" href="/">
            Вернуться к сбору
          </Link>
        </div>
      </div>
    );
  }

  const paidAmount = status?.paidAmountKopecks ?? status?.amountKopecks ?? null;

  return (
    <div className={styles.screen}>
      <div className={styles.scene}>
        <HandsScene />
      </div>

      {phase === "checking" ? (
        <>
          <div className="eyebrow">
            <span className="dot" /> Платёж принят в обработку
          </div>
          <h1 className={styles.title}>Спасибо. Проверяем перевод</h1>
          <PollingPhrases />
          <p className={styles.hint}>
            Не закрывайте страницу — обычно это занимает несколько секунд
          </p>
        </>
      ) : null}

      {phase === "paid" ? (
        <>
          <div className="eyebrow">
            <span className="dot" /> Платёж подтверждён
          </div>
          <h1 className={styles.title}>Ваше пожертвование дошло</h1>
          {paidAmount === null ? null : (
            <p className={styles.sum}>{kopecksToRubDisplay(paidAmount)}</p>
          )}
          <p className={styles.lede}>
            Пожертвование уже учтено в общей сумме сбора. Ничего больше делать не нужно.
          </p>

          <ShareBox title="Расскажите о сборе" />
          <OrderLine
            orderId={orderId}
            hint="сохраните, если понадобится к нам обратиться"
          />
        </>
      ) : null}

      {phase === "timeout" ? (
        <>
          <div className="eyebrow">
            <span className="dot" /> Ещё проверяем
          </div>
          <h1 className={styles.title}>Подтверждение ещё не получено</h1>
          <p className={styles.lede}>
            {error ?? "Подтверждение перевода занимает больше времени, чем обычно."}{" "}
            Сохраните подтверждение банка и проверьте статус позже. Если подтверждение
            не появится, обратитесь к организаторам сбора для сверки.
          </p>
          {/* Отдельной строкой и жирным. Без неё человек, увидевший
              неопределённость, идёт платить повторно — худший исход:
              двойное списание и возврат руками. */}
          <p className={`${styles.lede} ${styles.strong}`}>Платить второй раз не нужно.</p>

          <div className={styles.row}>
            <button className="btn btn-ghost" type="button" onClick={retry}>
              Проверить ещё раз
            </button>
            <Link className="btn btn-ghost" href="/">
              Вернуться к сбору
            </Link>
          </div>

          <ShareBox title="А пока — расскажите о сборе" />
          <OrderLine orderId={orderId} hint="назовите его, если будете писать нам" />
        </>
      ) : null}

      {phase === "failed" ? (
        <>
          <div className="eyebrow">
            <span className="dot" /> Платёж не прошёл
          </div>
          <h1 className={styles.title}>Платёж пока не подтверждён</h1>
          <p className={styles.lede}>
            Заказ отмечен как неуспешный. Если банк показывает списание,
            не платите повторно: сохраните подтверждение и обратитесь к организаторам
            для сверки. Позднее подтверждение платёжной системы будет учтено.
          </p>

          <div className={styles.row}>
            <button className="btn btn-primary" type="button" onClick={retry}>
              Проверить ещё раз
            </button>
          </div>

          <OrderLine orderId={orderId} hint="назовите его, если будете писать нам" />
        </>
      ) : null}
    </div>
  );
}
