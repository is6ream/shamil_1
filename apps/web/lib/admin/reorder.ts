/**
 * Порядок списков (этапы, галерея, видео, фото этапа). Кнопки «выше/ниже»
 * вместо одного drag-n-drop: на телефоне перетаскивание в длинном списке
 * промахивается, кнопка — нет.
 */

/** Новый массив с элементом, сдвинутым на `delta`; за край — без изменений. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;

  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(index, 1);

  next.splice(target, 0, moved);
  return next;
}

/** Тело `PUT …/order`: все id ровно по разу (API.md §8, §9, §11). */
export function orderBody(items: readonly { readonly id: string }[]): { ids: string[] } {
  return { ids: items.map((item) => item.id) };
}
