"use client";

import Image from "next/image";
import { useRef } from "react";

import { ArrowRightIcon, CloseIcon, PlayIcon } from "@/components/icons/Icons";

import styles from "./InterviewPreview.module.css";

export function InterviewPreview() {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        ref={trigger}
        id="o-proekte"
        type="button"
        className={styles.preview}
        aria-haspopup="dialog"
        aria-controls="interview-announcement"
        onClick={() => dialog.current?.showModal()}
      >
        <span className={styles.thumbnail} aria-hidden="true">
          <Image src="/landing/interview.webp" alt="" fill sizes="132px" />
          <span className={styles.play}><PlayIcon /></span>
        </span>
        <span className={styles.copy}>
          <span className={styles.soon}>Скоро</span>
          <strong>Видео о проекте</strong>
          <span className={styles.subtitle}>Интервью с имамом мечети</span>
        </span>
        <ArrowRightIcon />
      </button>

      <dialog
        ref={dialog}
        id="interview-announcement"
        className={styles.dialog}
        aria-labelledby="interview-title"
        aria-describedby="interview-description"
        onClose={() => trigger.current?.focus({ preventScroll: true })}
      >
        <form method="dialog">
          <button type="submit" className={styles.close} aria-label="Закрыть анонс">
            <CloseIcon />
          </button>
        </form>
        <p className={styles.soon}>Скоро</p>
        <h2 id="interview-title">Интервью с имамом мечети</h2>
        <p id="interview-description">Имам расскажет о проекте мечети «Шамиль» и её роли в жизни махалли.</p>
      </dialog>
    </>
  );
}
