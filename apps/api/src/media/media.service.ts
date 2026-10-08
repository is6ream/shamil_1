import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { Page, PageQueryDto } from '../common/pagination';
import { pageArgs } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ImageProcessor, WEBP_CONTENT_TYPE } from './image-processor';
import type { ProcessedVariant } from './image-processor';
import { MediaUsageService } from './media-usage.service';
import type { MediaUsage } from './media-usage.service';
import { mediaUrls, variantKey, variantKeys } from './media-urls';
import type { MediaUrls } from './media-urls';
import { STORAGE_DRIVER } from './storage/storage.types';
import type { StorageDriver } from './storage/storage.types';

export interface MediaAssetResponse {
  readonly id: string;
  /** Крупный вариант. */
  readonly url: string;
  readonly urls: MediaUrls;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly altText: string | null;
  readonly originalName: string | null;
  readonly createdAt: string;
}

export interface MediaAssetDetailResponse extends MediaAssetResponse {
  readonly usages: readonly MediaUsage[];
}

export interface UploadedImage {
  readonly buffer: Buffer;
  readonly originalname: string;
}

const ORIGINAL_NAME_MAX_LENGTH = 200;

const ASSET_SELECT = {
  id: true,
  storageKey: true,
  width: true,
  height: true,
  bytes: true,
  altText: true,
  originalName: true,
  createdAt: true,
} as const;

type AssetRow = Prisma.MediaAssetGetPayload<{ select: typeof ASSET_SELECT }>;

/** `2026/10/<uuid>`: ключ генерирует сервер, имя файла клиента в него не попадает. */
export function newStorageKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `${year}/${month}/${randomUUID()}`;
}

/** Имя файла только для поиска в медиатеке: без пути и управляющих символов. */
export function sanitizeOriginalName(name: string): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();

  return cleaned.length === 0 ? null : cleaned.slice(0, ORIGINAL_NAME_MAX_LENGTH);
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageProcessor,
    private readonly usages: MediaUsageService,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /**
   * Загрузка: проверка и пережатие → файлы в хранилище → строка в БД с журналом.
   * Если запись в БД не удалась, загруженные файлы удаляются — сирот в бакете
   * не остаётся.
   */
  async upload(
    file: UploadedImage | undefined,
    altText: string | undefined,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<MediaAssetResponse> {
    if (file === undefined || file.buffer.length === 0) {
      throw new BadRequestException('Нужен файл изображения в поле file');
    }

    const variants = await this.images.process(file.buffer);
    const storageKey = newStorageKey();

    await this.putVariants(storageKey, variants);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const largest = variants[variants.length - 1];

        if (largest === undefined) {
          throw new Error('Обработка изображения не вернула вариантов');
        }

        const created = await tx.mediaAsset.create({
          data: {
            storageKey,
            variants: variants.map(({ size, width, height, bytes }) => ({ size, width, height, bytes })),
            width: largest.width,
            height: largest.height,
            bytes: variants.reduce((sum, variant) => sum + variant.bytes, 0),
            originalName: sanitizeOriginalName(file.originalname),
            altText: altText ?? null,
            createdById: actor.id,
          },
          select: ASSET_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'media.upload',
          entityType: 'media_asset',
          entityId: created.id,
          after: { storageKey, width: created.width, height: created.height, altText: created.altText },
          meta,
        });

        return this.toResponse(created);
      });
    } catch (error: unknown) {
      await this.removeFiles(storageKey);
      throw error;
    }
  }

  async list(query: PageQueryDto): Promise<Page<MediaAssetResponse>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({
        select: ASSET_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.mediaAsset.count(),
    ]);

    return { items: rows.map((row) => this.toResponse(row)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<MediaAssetDetailResponse> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.mediaAsset.findUnique({ where: { id }, select: ASSET_SELECT });

      if (row === null) {
        throw new NotFoundException('Файл медиатеки не найден');
      }

      return { ...this.toResponse(row), usages: await this.usages.findUsages(tx, id) };
    });
  }

  async updateAlt(id: string, altText: string | null, actor: AdminPrincipal, meta: RequestMeta): Promise<MediaAssetResponse> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.mediaAsset.findUnique({ where: { id }, select: ASSET_SELECT });

      if (before === null) {
        throw new NotFoundException('Файл медиатеки не найден');
      }

      const updated = await tx.mediaAsset.update({ where: { id }, data: { altText }, select: ASSET_SELECT });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'media.update',
        entityType: 'media_asset',
        entityId: id,
        before: { altText: before.altText },
        after: { altText: updated.altText },
        meta,
      });

      return this.toResponse(updated);
    });
  }

  /** Используемый файл не удаляется — 409 со списком мест, где он стоит. */
  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    const storageKey = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "media_asset" WHERE "id" = ${id}::uuid FOR UPDATE`;

      if (locked.length === 0) {
        throw new NotFoundException('Файл медиатеки не найден');
      }

      const usages = await this.usages.findUsages(tx, id);

      if (usages.length > 0) {
        throw new ConflictException({
          message: 'Файл используется — сначала уберите его из этих мест',
          usages,
        });
      }

      const deleted = await tx.mediaAsset.delete({ where: { id }, select: ASSET_SELECT });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'media.delete',
        entityType: 'media_asset',
        entityId: id,
        before: { storageKey: deleted.storageKey, originalName: deleted.originalName, altText: deleted.altText },
        meta,
      });

      return deleted.storageKey;
    });

    // Файлы — после коммита: если удалить их раньше, а транзакция откатится,
    // строка в БД останется со ссылками в никуда.
    await this.removeFiles(storageKey);
  }

  async assertExists(tx: Prisma.TransactionClient, id: string): Promise<void> {
    const found = await tx.mediaAsset.findUnique({ where: { id }, select: { id: true } });

    if (found === null) {
      throw new BadRequestException(`Файл медиатеки ${id} не найден`);
    }
  }

  private async putVariants(storageKey: string, variants: readonly ProcessedVariant[]): Promise<void> {
    try {
      await Promise.all(
        variants.map((variant) =>
          this.storage.put(variantKey(storageKey, variant.size), variant.buffer, WEBP_CONTENT_TYPE),
        ),
      );
    } catch (error: unknown) {
      await this.removeFiles(storageKey);
      throw error;
    }
  }

  /** Сбой удаления файлов не роняет операцию: сирота в бакете безопаснее битой ссылки. */
  private async removeFiles(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(variantKeys(storageKey));
    } catch (error: unknown) {
      this.logger.warn(
        `Не удалось удалить файлы ${storageKey} из хранилища: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toResponse(row: AssetRow): MediaAssetResponse {
    const urls = mediaUrls(this.storage, row.storageKey);

    return {
      id: row.id,
      url: urls.lg,
      urls,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      altText: row.altText,
      originalName: row.originalName,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
