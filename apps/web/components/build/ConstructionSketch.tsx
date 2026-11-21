"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { DonateLink } from "@/components/donation/DonateLink";
import { ArrowRightIcon } from "@/components/icons/Icons";

import styles from "./ConstructionTimeline.module.css";

const STEPS = [
  { title: "Проект", description: "Проект и разрешительная документация определяют облик будущей мечети." },
  { title: "Фундамент", description: "На площадке появляется основание будущего здания." },
  { title: "Стены", description: "Стены, арки и перекрытия формируют объём молитвенного зала." },
  { title: "Купол и минарет", description: "Кровля, купол и минарет завершают силуэт мечети." },
  { title: "Инженерные сети", description: "На эскизе включается освещение. На этом этапе прокладывают инженерные сети." },
  { title: "Отделка", description: "Фасад приобретает цвет, фактуру и узоры." },
  { title: "Благоустройство", description: "Дорожки и озеленение дополняют будущий облик мечети." },
] as const;

const MODEL = "/landing/mosque-model.webp";
const LAYERS = [
  { stage: 1, className: styles.foundation },
  { stage: 2, className: styles.walls },
  { stage: 3, className: styles.roof },
  { stage: 3, className: styles.minaret },
];

export function ConstructionSketch() {
  const [stage, setStage] = useState(0);
  const final = stage === STEPS.length - 1;
  const firstStep = useRef<HTMLButtonElement>(null);
  const donateAction = useRef<HTMLDivElement>(null);

  const focusDonateAction = useRef(false);

  useEffect(() => {
    if (final && focusDonateAction.current) {
      focusDonateAction.current = false;
      donateAction.current?.querySelector("a")?.focus({ preventScroll: true });
    }
  }, [final]);

  function advance() {
    const next = stage + 1;
    focusDonateAction.current = next === STEPS.length - 1;
    setStage(next);
  }

  function reset() {
    setStage(0);
    firstStep.current?.focus();
  }

  return (
    <div className={styles.storyboard}>
      <figure className={styles.sketch} data-stage={stage} aria-labelledby="construction-sketch-title">
        <div className={styles.sketchHeading}>
          <h3 id="construction-sketch-title">Эскиз будущей мечети</h3>
          <span aria-hidden="true">{String(stage + 1).padStart(2, "0")} / 07</span>
        </div>
        <div className={styles.art} aria-hidden="true">
          <div className={styles.scene}>
            <Image className={styles.blueprint} src={MODEL} alt="" fill sizes="(max-width: 730px) 340px, 660px" />
            <Image className={styles.grounds} src="/landing/grounds.webp" alt="" width={1050} height={350} sizes="(max-width: 730px) 340px, 660px" />
            <div className={styles.path} />
            {LAYERS.map((layer) => (
              <Image
                key={layer.className}
                className={`${styles.layer} ${layer.className}`}
                data-visible={stage >= layer.stage}
                src={MODEL}
                alt=""
                fill
                sizes="(max-width: 730px) 340px, 660px"
              />
            ))}
            <div className={styles.lighting} />
          </div>
        </div>
        <figcaption className={styles.caption} aria-live="polite" aria-atomic="true">
          <strong>{STEPS[stage].title}</strong>
          <span>{STEPS[stage].description}</span>
        </figcaption>
      </figure>

      <div className={styles.controls}>
        <ol className={styles.steps} aria-label="Этапы строительства">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <button
                ref={index === 0 ? firstStep : undefined}
                type="button"
                aria-pressed={index === stage}
                onClick={() => setStage(index)}
              >
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                {step.title}
                <ArrowRightIcon />
              </button>
            </li>
          ))}
        </ol>
        <div className={styles.actions}>
          <button className="btn btn-primary" type="button" onClick={advance} hidden={final}>
            Следующий этап <ArrowRightIcon />
          </button>
          <div ref={donateAction} className={styles.finalActions} hidden={!final}>
            <DonateLink>Сделать садака</DonateLink>
            <button className="btn btn-ghost" type="button" onClick={reset}>Начать сначала</button>
          </div>
        </div>
      </div>
    </div>
  );
}
