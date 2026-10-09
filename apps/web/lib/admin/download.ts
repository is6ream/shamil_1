/**
 * Сохранение файла, полученного `fetch` с Bearer: обычная ссылка `<a href>`
 * токен не отправит (API.md §13, CSV). Ссылка на blob отзывается сразу
 * после клика — файл браузер к этому моменту уже забрал.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Отзываем в следующем такте: часть браузеров начинает скачивание асинхронно.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
