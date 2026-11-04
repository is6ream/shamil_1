"use client";

import { useState } from "react";

import { withQuery } from "@/lib/admin/query";
import { errorMessage } from "@/lib/admin/errors";
import { SECTION_IDS } from "@/lib/content";
import { plural } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";
import { sectionHref } from "@/lib/scroll-to-section";
import { DONOR_PATHS } from "@/lib/donor/endpoints";
import {
  CERTIFICATE_STATUS_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  dayLabel,
  groupByDay,
  happenedAt,
  methodLabel,
  timeLabel,
} from "@/lib/donor/history";
import { useDonorQuery } from "@/lib/donor/hooks";
import { donorClient } from "@/lib/donor/session";
import type { DonorHistory, DonorHistoryItem, TaxCertificate } from "@/lib/donor/types";

import styles from "./MyHelp.module.css";
import { Skeleton } from "./Skeleton";

const PAGE_SIZE = 20;
const RECEIPT_FORMS = ["поступление", "поступления", "поступлений"] as const;

interface MorePages {
  /** Для какого года и первой страницы набраны «ещё» — при смене года сбрасываются. */
  readonly key: string;
  readonly items: readonly DonorHistoryItem[];
  readonly nextCursor: string | null;
}

/** «Моя помощь»: пожертвования по дням, фильтр года, справка для вычета. */
export function MyHelp() {
  const [year, setYear] = useState<number | null>(null);
  const path = withQuery(DONOR_PATHS.donations, { year: year ?? undefined, limit: PAGE_SIZE });
  const history = useDonorQuery<DonorHistory>(path);
  const certificates = useDonorQuery<readonly TaxCertificate[]>(DONOR_PATHS.taxCertificates);
  const [more, setMore] = useState<MorePages | null>(null);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // «Сегодня/Вчера» — относительно открытия страницы, а не каждого рендера.
  const [now] = useState(() => Date.now());

  if (history.error !== null) {
    return (
      <div className={`card ${styles.block}`} role="alert">
        <p>{history.error}</p>
        <button className="btn btn-ghost btn-sm" type="button" onClick={history.reload}>
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  if (history.data === null) {
    return <MyHelpSkeleton />;
  }

  const data = history.data;
  const extra = more !== null && more.key === path ? more : null;
  const items = extra === null ? data.items : [...data.items, ...extra.items];
  const nextCursor = extra === null ? data.nextCursor : extra.nextCursor;
  const certificate = certificates.data?.find((row) => row.year === data.year) ?? null;

  async function loadMore() {
    if (nextCursor === null) {
      return;
    }

    setLoadingMore(true);
    setMoreError(null);

    try {
      const page = await donorClient().request<DonorHistory>(
        withQuery(DONOR_PATHS.donations, { year: data.year, cursor: nextCursor, limit: PAGE_SIZE }),
      );

      setMore({ key: path, items: [...(extra?.items ?? []), ...page.items], nextCursor: page.nextCursor });
    } catch (error: unknown) {
      setMoreError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>Моя помощь</h1>
        {data.years.length > 1 ? (
          <label className={styles.year}>
            <span className="sr-only">Год</span>
            <select
              className={styles.select}
              value={data.year}
              onChange={(event) => {
                setMore(null);
                setYear(Number(event.target.value));
              }}
            >
              {data.years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className={`card ${styles.summary}`}>
        <div>
          <span className={styles.label}>Итого за {data.year}</span>
          <span className="amount amount-md">{kopecksToRubDisplay(data.yearTotalKopecks)}</span>
        </div>
        <TaxCertificateBlock
          year={data.year}
          hasPayments={data.yearTotalKopecks !== "0"}
          certificate={certificate}
          onRequested={certificates.reload}
        />
      </div>

      {items.length === 0 ? (
        <EmptyHistory year={data.year} isCurrentYear={data.years[0] === data.year} />
      ) : (
        <ol className={styles.days}>
          {groupByDay(items).map((day) => (
            <li key={day.day} className={`card ${styles.day}`}>
              <div className={styles.dayHead}>
                <b>{dayLabel(day.day, now)}</b>
                <span className={styles.muted}>
                  {day.items.length} {plural(day.items.length, RECEIPT_FORMS)} · {kopecksToRubDisplay(day.paidTotalKopecks.toString())}
                </span>
              </div>
              <ul className={styles.rows}>
                {day.items.map((item) => (
                  <HistoryRow key={item.id} item={item} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {moreError === null ? null : (
        <p className={styles.error} role="alert">
          {moreError}
        </p>
      )}
      {nextCursor === null ? null : (
        <button className="btn btn-ghost" type="button" aria-busy={isLoadingMore} onClick={() => void loadMore()}>
          Загрузить ещё
        </button>
      )}
    </>
  );
}

function HistoryRow({ item }: { readonly item: DonorHistoryItem }) {
  return (
    <li className={styles.row}>
      <span className={styles.time}>{timeLabel(happenedAt(item))}</span>
      <span className={styles.what}>
        <b className={styles.sum}>{kopecksToRubDisplay(item.amountKopecks)}</b>
        <span className={styles.muted}>
          {methodLabel(item.method)} · {KIND_LABELS[item.kind]}
        </span>
      </span>
      <span className={item.status === "paid" ? styles.ok : styles.failed}>{STATUS_LABELS[item.status]}</span>
    </li>
  );
}

interface CertificateProps {
  readonly year: number;
  readonly hasPayments: boolean;
  readonly certificate: TaxCertificate | null;
  readonly onRequested: () => void;
}

/**
 * Заявка на справку для налогового вычета: одна на год. PDF не генерируем —
 * бухгалтер отвечает вручную, статус виден здесь.
 */
function TaxCertificateBlock({ year, hasPayments, certificate, onRequested }: CertificateProps) {
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (certificate !== null) {
    return (
      <div className={styles.certificate}>
        <span className={styles.label}>Справка за {year}</span>
        <b>{CERTIFICATE_STATUS_LABELS[certificate.status]}</b>
        {certificate.adminComment === null ? null : <span className={styles.muted}>{certificate.adminComment}</span>}
      </div>
    );
  }

  if (!hasPayments) {
    return null;
  }

  async function request() {
    setBusy(true);
    setError(null);

    try {
      await donorClient().request(DONOR_PATHS.taxCertificates, { method: "POST", body: { year } });
      onRequested();
    } catch (caught: unknown) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.certificate}>
      <button className="btn btn-ghost btn-sm" type="button" aria-busy={isBusy} onClick={() => void request()}>
        Справка для налогового вычета
      </button>
      {/* TODO(оферта): срок ответа и пункт оферты — текст допишет заказчик. В нашей
          оферте пункта 5.1.4 (он из оферты mechet.ru) нет. */}
      <span className={styles.muted}>Подготовим справку за {year} год и сообщим на почту.</span>
      {error === null ? null : (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function EmptyHistory({ year, isCurrentYear }: { readonly year: number; readonly isCurrentYear: boolean }) {
  return (
    <div className={`card ${styles.empty}`}>
      <b className={styles.emptyTitle}>{isCurrentYear ? "Пожертвований пока нет" : `В ${year} году пожертвований нет`}</b>
      <p className={styles.muted}>
        Пожертвования, сделанные после входа в кабинет, появятся здесь. Даже 100 ₽ — это кирпич в стене мечети.
      </p>
      <a className="btn btn-primary" href={sectionHref(SECTION_IDS.donate)}>
        Поддержать строительство
      </a>
    </div>
  );
}

function MyHelpSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем историю">
      <Skeleton width="45%" height="36px" />
      <Skeleton height="96px" />
      <Skeleton height="140px" />
      <Skeleton height="140px" />
    </div>
  );
}
