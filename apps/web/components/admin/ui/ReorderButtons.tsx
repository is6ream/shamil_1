import { Button } from "./Button";
import styles from "./ReorderButtons.module.css";

interface Props {
  readonly label: string;
  readonly index: number;
  readonly count: number;
  readonly isDisabled?: boolean;
  readonly onMove: (index: number, delta: number) => void;
}

/** Кнопки «выше/ниже» — крупные цели касания вместо перетаскивания. */
export function ReorderButtons({ label, index, count, isDisabled = false, onMove }: Props) {
  return (
    <div className={styles.group} role="group" aria-label={`Порядок: ${label}`}>
      <Button
        variant="ghost"
        isSmall
        className={styles.button}
        aria-label={`Выше: ${label}`}
        disabled={isDisabled || index === 0}
        onClick={() => onMove(index, -1)}
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        isSmall
        className={styles.button}
        aria-label={`Ниже: ${label}`}
        disabled={isDisabled || index === count - 1}
        onClick={() => onMove(index, 1)}
      >
        ↓
      </Button>
    </div>
  );
}
