"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ShareLinks } from "@/components/share/ShareLinks";
import { METRIKA_GOALS } from "@/lib/analytics/goals";
import { metrika } from "@/lib/analytics/metrika";
import { kopecksToRubDisplay } from "@/lib/money";

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
        Поделитесь ссылкой на сбор с близкими.
      </p>
      <ShareLinks highlightFirst />
    </div>
  );
}

function OrderLine({ orderId }: { readonly orderId: string }) {
  return (
    <p className={styles.order}>
      Номер платежа для обращения <b>{orderId}</b>
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

  // Вспомогательная цель без суммы: деньги в Метрику отправляет только сервер
  // офлайн-конверсией `donation_paid`, иначе оплата посчиталась бы дважды.
  useEffect(() => {
    if (phase === "paid") {
      metrika.reachGoal(METRIKA_GOALS.successView);
    }
  }, [phase]);

  if (orderId === null) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Здесь показывается статус платежа</h1>
        <p className={styles.lede}>
          В ссылке нет номера платежа. Если деньги списались, сохраните подтверждение банка
          и обратитесь к организаторам сбора.
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
      {phase === "checking" ? (
        <>
          <h1 className={styles.title}>Проверяем платёж</h1>
          <p className={styles.lede} role="status">
            Ждём подтверждения от платёжной системы.
          </p>
        </>
      ) : null}

      {phase === "paid" ? (
        <>
          <h1 className={styles.title}>Спасибо за пожертвование!</h1>
          {paidAmount === null ? null : (
            <p className={styles.sum}>{kopecksToRubDisplay(paidAmount)}</p>
          )}
          <p className={styles.lede}>
            Ваше пожертвование на строительство мечети «Шамиль» учтено в сборе.
          </p>

          <Link className={styles.back} href="/">
            Вернуться к сбору
          </Link>
          <ShareBox title="Расскажите о сборе" />
          <OrderLine orderId={orderId} />
        </>
      ) : null}

      {phase === "timeout" ? (
        <>
          <h1 className={styles.title}>Платёж ещё не подтверждён</h1>
          <p className={styles.lede}>
            {error ? "Не удалось проверить статус платежа." : "Подтверждение занимает больше времени, чем обычно."}
          </p>
          <p className={`${styles.lede} ${styles.strong}`}>Если деньги списались, не оплачивайте повторно.</p>

          <div className={styles.row}>
            <button className="btn btn-ghost" type="button" onClick={retry}>
              Проверить ещё раз
            </button>
            <Link className="btn btn-ghost" href="/">
              Вернуться к сбору
            </Link>
          </div>

          <ShareBox title="А пока — расскажите о сборе" />
          <OrderLine orderId={orderId} />
        </>
      ) : null}

      {phase === "failed" ? (
        <>
          <h1 className={styles.title}>Платёж не прошёл</h1>
          <p className={styles.lede}>
            Если банк показывает списание, сохраните подтверждение и обратитесь к организаторам сбора.
          </p>

          <div className={styles.row}>
            <button className="btn btn-primary" type="button" onClick={retry}>
              Проверить ещё раз
            </button>
            <Link className={styles.back} href="/">
              Вернуться к сбору
            </Link>
          </div>

          <OrderLine orderId={orderId} />
        </>
      ) : null}
    </div>
  );
}
