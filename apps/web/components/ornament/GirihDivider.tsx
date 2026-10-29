import { GirihStar } from "./GirihStar";
import styles from "./GirihDivider.module.css";

type GirihDividerProps = {
  className?: string;
};

/**
 * Разделитель «линия — звезда — линия» золотом. Длину линий задаёт
 * родитель через `--girih-divider-line` (по умолчанию 96px), выравнивание —
 * своим классом через `className`.
 */
export function GirihDivider({ className }: GirihDividerProps) {
  return (
    <div className={className ? `${styles.divider} ${className}` : styles.divider} aria-hidden="true">
      <span className={styles.line} />
      <GirihStar className={styles.star} />
      <span className={styles.line} />
    </div>
  );
}
