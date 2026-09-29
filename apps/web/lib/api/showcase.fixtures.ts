/**
 * Статический контент витрины, у которого нет таблицы в БД.
 *
 * Цифры сбора, рейтинги и лента отсюда удалены: они приходят из бэкенда,
 * и ни одна выдуманная сумма не должна остаться в коде, который ходит в сеть.
 * Остались ход строительства (контент заказчика) и плашки галереи,
 * которые показываются, пока в базе нет ни одного снимка.
 */

import type { BuildProgress, ConstructionTimeline, GalleryItem } from "./types";

/**
 * Ход строительства. Текст от заказчика; здесь — структура и пример
 * наполнения из прототипа.
 *
 * TODO(заказчик): настоящие этапы и дата последнего обновления.
 */
export const FIXTURE_BUILD_PROGRESS: BuildProgress = {
  updatedAt: "2026-09-18T00:00:00.000Z",
  done: {
    title: "Выполнено",
    items: ["свайное поле", "фундамент", "подвод коммуникаций"],
  },
  current: {
    title: "Сейчас в работе",
    items: ["кладка стен", "перекрытия"],
  },
  upcoming: {
    title: "Предстоит",
    items: ["купол", "минареты", "отделка"],
  },
};

/**
 * Галерея. `url: null` — настоящих фотографий стройки ещё нет
 * (блокер из CLAUDE.md), до них показываем плашку с датой.
 * Требования к съёмке — docs/design/photos.md.
 */
export const FIXTURE_GALLERY: readonly GalleryItem[] = [
  { id: "shot-1", url: null, caption: "Заливка фундамента", takenAtLabel: "июнь 2026" },
  { id: "shot-2", url: null, caption: "Свайное поле", takenAtLabel: "июль 2026" },
  { id: "shot-3", url: null, caption: "Кладка стен", takenAtLabel: "август 2026" },
  { id: "shot-4", url: null, caption: "Перекрытия", takenAtLabel: "сентябрь 2026" },
];

/**
 * Этапы стройки для таймлайна макета v2. Названия этапов — из макета,
 * статусы и сметы выдуманы.
 *
 * TODO(заказчик): фактические статусы, сметы этапов и дата обновления.
 */
export const FIXTURE_CONSTRUCTION: ConstructionTimeline = {
  updatedAt: "2026-09-18T00:00:00.000Z",
  stages: [
    { id: "project", title: "Проект и разрешительная документация", status: "done", amountKopecks: "320000000" },
    { id: "foundation", title: "Земляные работы и фундамент", status: "done", amountKopecks: "2150000000" },
    { id: "walls", title: "Стены и перекрытия", status: "current", amountKopecks: "5400000000" },
    { id: "roof", title: "Кровля, купол и минарет", status: "upcoming", amountKopecks: "4800000000" },
    { id: "utilities", title: "Инженерные сети", status: "upcoming", amountKopecks: "3100000000" },
    { id: "finishing", title: "Внутренняя и наружная отделка", status: "upcoming", amountKopecks: "6200000000" },
    { id: "landscaping", title: "Благоустройство территории", status: "upcoming", amountKopecks: "2030000000" },
  ],
};
