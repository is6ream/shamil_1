import styles from "./Skeleton.module.css";

interface Props {
  readonly width?: string;
  readonly height?: string;
  readonly className?: string;
}

/** Серый блок на месте будущих данных — вместо текста «Загрузка…». */
export function Skeleton({ width = "100%", height = "1em", className }: Props) {
  return <span className={`${styles.block} ${className ?? ""}`} style={{ width, height }} aria-hidden="true" />;
}
