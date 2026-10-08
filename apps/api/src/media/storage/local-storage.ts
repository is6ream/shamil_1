import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { StorageDriver } from './storage.types';

/**
 * Каталог на диске — для разработки и тестов. В production запрещён
 * валидацией окружения: диск контейнера эфемерен (D-16, пересмотрено).
 * Файлы раздаёт сам Nest по `/media` (bootstrap.ts).
 */
export class LocalStorage implements StorageDriver {
  readonly name = 'local' as const;

  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolveKey(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async remove(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolveKey(key), { force: true })));
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async ping(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await stat(this.rootDir);
  }

  /**
   * Ключи генерирует сервер, но путь всё равно проверяется: выход за пределы
   * каталога медиатеки не должен быть возможен даже при ошибке в коде.
   */
  private resolveKey(key: string): string {
    const root = resolve(this.rootDir);
    const target = resolve(root, key);

    if (!target.startsWith(root + sep)) {
      throw new Error(`Ключ медиатеки вне каталога хранилища: ${key}`);
    }

    return target;
  }
}
