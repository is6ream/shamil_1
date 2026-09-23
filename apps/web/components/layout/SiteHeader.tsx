"use client";

import { useEffect, useState } from "react";

import { SITE_NAME } from "@/lib/site";

import { MosqueMark } from "./MosqueMark";

/** После какого сдвига у шапки появляется нижняя граница. */
const STUCK_AFTER_PX = 8;

/**
 * Шапка сайта. Клиентский компонент ради одной вещи: граница снизу
 * появляется только когда страница прокручена — иначе на первом экране
 * линия режет градиентную панель.
 *
 * Кнопка ведёт к форме: на десктопе она в правой колонке и видна сразу,
 * на телефоне — третьим блоком сверху.
 */
export function SiteHeader() {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsStuck(window.scrollY > STUCK_AFTER_PX);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header className={`top${isStuck ? " stuck" : ""}`}>
      <div className="wrap">
        <a className="brand" href="#top">
          <span className="mark">
            <MosqueMark />
          </span>
          <span>
            <b>{SITE_NAME}</b>
            <i>Уфа · сбор на строительство</i>
          </span>
        </a>
        <nav aria-label="Разделы страницы">
          <a href="#goal">Цель</a>
          <a href="#build">Ход стройки</a>
          <a href="#regions">Регионы</a>
          <a href="#docs">Документы</a>
        </nav>
        <a className="btn btn-primary btn-sm" href="#donate">
          Пожертвовать
        </a>
      </div>
    </header>
  );
}
