import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';
import { StorageDriver as StorageDriverName } from '../../config/env.validation';
import { LocalStorage } from './local-storage';
import { S3Storage } from './s3-storage';
import { STORAGE_DRIVER } from './storage.types';
import type { StorageDriver } from './storage.types';

export function createStorageDriver(config: ConfigService<AppConfig, true>): StorageDriver {
  const media = config.get('media', { infer: true });

  switch (media.driver) {
    case StorageDriverName.Local:
      return new LocalStorage(media.localDir, media.publicUrl);
    case StorageDriverName.S3: {
      if (media.s3 === undefined) {
        throw new Error('STORAGE_DRIVER=s3, но настройки S3 не собраны');
      }

      return new S3Storage(media.s3);
    }
    default: {
      const unknown: never = media.driver;
      throw new Error(`Неизвестное хранилище медиатеки: ${String(unknown)}`);
    }
  }
}

/** Хранилище медиатеки одним провайдером на приложение. */
@Module({
  providers: [{ provide: STORAGE_DRIVER, inject: [ConfigService], useFactory: createStorageDriver }],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
