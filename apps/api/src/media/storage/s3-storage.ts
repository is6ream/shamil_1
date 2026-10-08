import type * as S3Sdk from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';

import type { S3StorageConfig } from '../../config/configuration';
import { IMMUTABLE_CACHE_CONTROL } from './storage.types';
import type { StorageDriver } from './storage.types';

type S3Module = typeof S3Sdk;

/** Лимит `DeleteObjects` в S3 — 1000 ключей за запрос; у нас их три на файл. */
const DELETE_BATCH = 1000;

/**
 * S3-совместимое хранилище (Timeweb Cloud Object Storage). SDK загружается
 * лениво, при первом обращении (D-15): при `STORAGE_DRIVER=local` модуль
 * не попадает в память вовсе.
 *
 * Контрольные суммы — только когда их требует операция: новые версии SDK
 * по умолчанию шлют CRC32 на каждый PutObject, и часть S3-совместимых
 * хранилищ такой запрос отклоняет. **[проверить]** на реальном бакете Timeweb.
 */
export class S3Storage implements StorageDriver {
  readonly name = 's3' as const;

  private client: Promise<{ sdk: S3Module; client: S3Client }> | undefined;

  constructor(private readonly config: S3StorageConfig) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { sdk, client } = await this.connect();

    await client.send(
      new sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    const { sdk, client } = await this.connect();

    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      const batch = keys.slice(start, start + DELETE_BATCH);

      await client.send(
        new sdk.DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl}/${key}`;
  }

  async ping(): Promise<void> {
    const { sdk, client } = await this.connect();

    await client.send(new sdk.HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  private connect(): Promise<{ sdk: S3Module; client: S3Client }> {
    this.client ??= import('@aws-sdk/client-s3').then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: this.config.region,
        endpoint: this.config.endpoint,
        forcePathStyle: this.config.forcePathStyle,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    }));

    return this.client;
  }
}
