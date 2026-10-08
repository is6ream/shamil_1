/**
 * Хранилище файлов медиатеки. Две реализации: `local` (каталог на диске,
 * только dev/test) и `s3` (Timeweb S3 в production). Сервисы медиатеки
 * работают только с этим интерфейсом и не знают, куда легли байты.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Удаление нескольких ключей. Отсутствующий ключ — не ошибка. */
  remove(keys: readonly string[]): Promise<void>;
  /** Публичный адрес файла: по нему сайт грузит картинку. */
  publicUrl(key: string): string;
  /** Проверка доступности для `/health/ready`. Бросает, если хранилище недоступно. */
  ping(): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Кеш картинок на год: имя файла уникально, содержимое по ключу не меняется. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
