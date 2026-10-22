"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "./Button";
import styles from "./DataTable.module.css";

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  /** Числа и суммы — по правому краю на десктопе. */
  readonly isNumeric?: boolean;
}

interface DataTableProps<Row> {
  readonly caption: string;
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
}

interface ScrollEdges {
  /** Слева есть спрятанное — таблицу прокрутили вправо. */
  readonly start: boolean;
  /** Справа есть спрятанное. */
  readonly end: boolean;
}

const NO_EDGES: ScrollEdges = { start: false, end: false };

/** Что прокручивать в каждую сторону. Меряется при прокрутке и смене размеров. */
function useScrollEdges() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NO_EDGES);

  useEffect(() => {
    const element = ref.current;

    if (element === null) {
      return;
    }

    const update = () => {
      const hidden = element.scrollWidth - element.clientWidth;
      // Пиксель запаса: дробная ширина при масштабе страницы — не прокрутка.
      const start = element.scrollLeft > 1;
      const end = hidden - element.scrollLeft > 1;

      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    const observer = new ResizeObserver(update);

    update();
    observer.observe(element);

    if (element.firstElementChild !== null) {
      observer.observe(element.firstElementChild);
    }

    element.addEventListener("scroll", update, { passive: true });

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  return { ref, edges };
}

/**
 * Таблица, которая на телефоне становится списком карточек: каждая ячейка
 * получает подпись столбца из `data-label`. Горизонтальная прокрутка
 * на 360 px заказчику не подходит. С 720 px широкая таблица прокручивается
 * внутри своего контейнера, а не всей страницей; что за краем есть ещё
 * столбцы, подсказывают тень у края и подпись над таблицей.
 */
export function DataTable<Row>({ caption, columns, rows, rowKey }: DataTableProps<Row>) {
  const { ref, edges } = useScrollEdges();
  const isScrollable = edges.start || edges.end;

  return (
    <div className={styles.frame} data-more-start={edges.start} data-more-end={edges.end}>
      {isScrollable ? (
        <p className={styles.scrollHint} aria-hidden="true">
          Таблица шире экрана — прокрутите вбок →
        </p>
      ) : null}
      <div
        ref={ref}
        className={styles.scroll}
        // Прокручиваемую область должно быть можно прокрутить и с клавиатуры.
        tabIndex={isScrollable ? 0 : undefined}
        role={isScrollable ? "region" : undefined}
        aria-label={isScrollable ? `${caption}: таблица прокручивается вбок` : undefined}
      >
        <table className={styles.table}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.isNumeric ? styles.numeric : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.header}
                    className={column.isNumeric ? styles.numeric : undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PaginationProps {
  /** С единицы. */
  readonly page: number;
  readonly pageCount: number;
  readonly onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, onChange }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav className={styles.pagination} aria-label="Страницы">
      <Button variant="ghost" isSmall disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Назад
      </Button>
      <span aria-current="page">
        {page} из {pageCount}
      </span>
      <Button variant="ghost" isSmall disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Дальше
      </Button>
    </nav>
  );
}
