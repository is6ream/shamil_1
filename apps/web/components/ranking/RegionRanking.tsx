"use client";

import Image from "next/image";
import { useId, useState } from "react";

import type { RegionRankRow } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { kopecksToRubDisplay } from "@/lib/money";
import { REGION_ARMS } from "@/lib/region-arms";
import { REGION_RANKING_PAGE_SIZE } from "@/lib/region-ranking";

import styles from "./RegionRanking.module.css";

function CoatOfArms({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={styles.emblem}>
      {src && !failed ? (
        <Image
          alt={`Герб региона «${name}»`}
          className={styles.coat}
          src={src}
          fill
          sizes="44px"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.placeholder} aria-hidden="true">—</span>
      )}
    </span>
  );
}

export function RegionRanking({ regions }: { regions: readonly RegionRankRow[] | null }) {
  const listId = useId();
  const [limit, setLimit] = useState(REGION_RANKING_PAGE_SIZE);

  if (regions === null) {
    return <p className={styles.message}>Рейтинг регионов временно недоступен. Попробуйте обновить страницу позже.</p>;
  }

  const ranked = regions;
  if (ranked.length === 0) {
    return <p className={styles.message}>Пока нет данных о пожертвованиях по регионам</p>;
  }

  const visible = ranked.slice(0, limit);

  return (
    <div className={styles.panel} data-expanded={limit > REGION_RANKING_PAGE_SIZE}>
      <ol className={styles.list} id={listId} role="list">
        {visible.map((region, index) => {
          const emblem = Object.hasOwn(REGION_ARMS, region.slug) ? REGION_ARMS[region.slug] : undefined;
          const name = emblem?.name ?? region.name;
          return (
            <li className={styles.row} key={region.slug} tabIndex={-1} id={`${listId}-${index}`}>
              <CoatOfArms key={emblem?.src} src={emblem?.src} name={name} />
              <div className={styles.details}>
                <span className={styles.name}>{name}</span>
                <span className={styles.count}>
                  {pluralize(region.donorsCount, ["пожертвование", "пожертвования", "пожертвований"])}
                </span>
              </div>
              <span className={styles.amount}>{kopecksToRubDisplay(region.paidTotalKopecks)}</span>
            </li>
          );
        })}
      </ol>
      <p className={styles.announcement} role="status">
        {limit > REGION_RANKING_PAGE_SIZE && `Показано ${visible.length} из ${ranked.length}`}
      </p>
      {visible.length < ranked.length && (
        <button
          className={styles.more}
          type="button"
          aria-controls={listId}
          onClick={() => {
            setLimit((current) => current + REGION_RANKING_PAGE_SIZE);
            requestAnimationFrame(() => document.getElementById(`${listId}-${visible.length}`)?.focus());
          }}
        >
          Загрузить больше
        </button>
      )}
      <p className={styles.credits}><a href="/region-arms/sources.txt">Источники гербов и лицензии</a></p>
    </div>
  );
}
