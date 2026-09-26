import type { ReactNode } from "react";

import styles from "./Eyebrow.module.css";

interface Props {
  readonly children: ReactNode;
}

/** Надзаголовок секции: капс, разрядка 0.12em, акцентный цвет (макет v2). */
export function Eyebrow({ children }: Props) {
  return <p className={styles.eyebrow}>{children}</p>;
}
