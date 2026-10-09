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

/**
 * Таблица, которая на телефоне становится списком карточек: каждая ячейка
 * получает подпись столбца из `data-label`. Горизонтальная прокрутка
 * на 360 px заказчику не подходит.
 */
export function DataTable<Row>({ caption, columns, rows, rowKey }: DataTableProps<Row>) {
  return (
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
