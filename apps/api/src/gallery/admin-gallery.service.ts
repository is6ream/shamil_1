import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { formatDateOnly, parseDateOnly } from '../common/dto-transforms';
import type { ReorderDto } from '../common/dto-transforms';
import { PrismaService } from '../database/prisma.service';
import { CAMPAIGN_SLUG } from '../database/seed/campaign.data';
import type { Prisma } from '../generated/prisma/client';
import { MEDIA_ASSET_SELECT, mediaUrls, toPublicImage } from '../media/media-urls';
import type { PublicImage } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { CreateGalleryItemDto, UpdateGalleryItemDto } from './dto/gallery.dto';

export interface AdminGalleryItemResponse {
  readonly id: string;
  readonly mediaAssetId: string | null;
  /** Картинка из медиатеки; `null` у строк, заведённых до админки. */
  readonly image: PublicImage | null;
  readonly url: string;
  readonly caption: string | null;
  readonly altText: string | null;
  readonly takenOn: string | null;
  readonly isPublished: boolean;
  readonly sortOrder: number;
  readonly updatedAt: string;
}

const ITEM_SELECT = {
  id: true,
  mediaAssetId: true,
  imageUrl: true,
  caption: true,
  altText: true,
  takenOn: true,
  isPublished: true,
  sortOrder: true,
  updatedAt: true,
  mediaAsset: { select: MEDIA_ASSET_SELECT },
} as const;

type ItemRow = Prisma.GalleryItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** Шаг порядка: между соседями остаётся место, чтобы вставить строку без перенумерации. */
const SORT_STEP = 10;

@Injectable()
export class AdminGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async list(): Promise<readonly AdminGalleryItemResponse[]> {
    const rows = await this.prisma.galleryItem.findMany({
      where: { campaign: { slug: CAMPAIGN_SLUG } },
      select: ITEM_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { takenOn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async create(dto: CreateGalleryItemDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminGalleryItemResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const campaignId = await this.campaignId(tx);
      const asset = await this.loadAsset(tx, dto.mediaAssetId);
      const created = await tx.galleryItem.create({
        data: {
          campaignId,
          mediaAssetId: asset.id,
          imageUrl: mediaUrls(this.storage, asset.storageKey).lg,
          width: asset.width,
          height: asset.height,
          caption: dto.caption ?? null,
          altText: dto.altText ?? asset.altText,
          takenOn: dto.takenOn === undefined || dto.takenOn === null ? null : parseDateOnly(dto.takenOn),
          isPublished: dto.isPublished ?? true,
          sortOrder: dto.sortOrder ?? (await this.nextSortOrder(tx, campaignId)),
        },
        select: ITEM_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'gallery.create',
        entityType: 'gallery_item',
        entityId: created.id,
        after: snapshot(created),
        meta,
      });

      return this.toResponse(created);
    });

    void this.revalidation.notify(['gallery']);

    return result;
  }

  async update(
    id: string,
    dto: UpdateGalleryItemDto,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<AdminGalleryItemResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.loadItem(tx, id);
      const asset = dto.mediaAssetId === undefined ? undefined : await this.loadAsset(tx, dto.mediaAssetId);
      const updated = await tx.galleryItem.update({
        where: { id },
        data: {
          ...(asset === undefined
            ? {}
            : {
                mediaAssetId: asset.id,
                imageUrl: mediaUrls(this.storage, asset.storageKey).lg,
                width: asset.width,
                height: asset.height,
              }),
          ...(dto.caption === undefined ? {} : { caption: dto.caption }),
          ...(dto.altText === undefined ? {} : { altText: dto.altText }),
          ...(dto.takenOn === undefined ? {} : { takenOn: dto.takenOn === null ? null : parseDateOnly(dto.takenOn) }),
          ...(dto.isPublished === undefined ? {} : { isPublished: dto.isPublished }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        },
        select: ITEM_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'gallery.update',
        entityType: 'gallery_item',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
        meta,
      });

      return this.toResponse(updated);
    });

    void this.revalidation.notify(['gallery']);

    return result;
  }

  /** Удаляется строка галереи; сам файл остаётся в медиатеке. */
  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.loadItem(tx, id);

      await tx.galleryItem.delete({ where: { id } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'gallery.delete',
        entityType: 'gallery_item',
        entityId: id,
        before: snapshot(before),
        meta,
      });
    });

    void this.revalidation.notify(['gallery']);
  }

  /** Новый порядок: `ids` — все строки галереи в нужной последовательности. */
  async reorder(dto: ReorderDto, actor: AdminPrincipal, meta: RequestMeta): Promise<readonly AdminGalleryItemResponse[]> {
    await this.prisma.$transaction(async (tx) => {
      const campaignId = await this.campaignId(tx);
      const existing = await tx.galleryItem.findMany({ where: { campaignId }, select: { id: true } });
      const known = new Set(existing.map((row) => row.id));

      if (dto.ids.length !== known.size || !dto.ids.every((id) => known.has(id))) {
        throw new BadRequestException('ids — все строки галереи ровно по одному разу');
      }

      for (const [index, id] of dto.ids.entries()) {
        await tx.galleryItem.update({ where: { id }, data: { sortOrder: (index + 1) * SORT_STEP } });
      }

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'gallery.reorder',
        entityType: 'gallery_item',
        after: { ids: dto.ids },
        meta,
      });
    });

    void this.revalidation.notify(['gallery']);

    return this.list();
  }

  private async campaignId(tx: Prisma.TransactionClient): Promise<string> {
    const campaign = await tx.campaign.findUnique({ where: { slug: CAMPAIGN_SLUG }, select: { id: true } });

    if (campaign === null) {
      throw new NotFoundException('Сбор не найден — запустите сиды');
    }

    return campaign.id;
  }

  private async nextSortOrder(tx: Prisma.TransactionClient, campaignId: string): Promise<number> {
    const last = await tx.galleryItem.aggregate({ where: { campaignId }, _max: { sortOrder: true } });

    return (last._max.sortOrder ?? 0) + SORT_STEP;
  }

  private async loadItem(tx: Prisma.TransactionClient, id: string): Promise<ItemRow> {
    const row = await tx.galleryItem.findUnique({ where: { id }, select: ITEM_SELECT });

    if (row === null) {
      throw new NotFoundException('Фото галереи не найдено');
    }

    return row;
  }

  private async loadAsset(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ id: string; storageKey: string; width: number; height: number; altText: string | null }> {
    const asset = await tx.mediaAsset.findUnique({ where: { id }, select: MEDIA_ASSET_SELECT });

    if (asset === null) {
      throw new BadRequestException('Файл медиатеки не найден');
    }

    return asset;
  }

  private toResponse(row: ItemRow): AdminGalleryItemResponse {
    const image = row.mediaAsset === null ? null : toPublicImage(this.storage, row.mediaAsset);

    return {
      id: row.id,
      mediaAssetId: row.mediaAssetId,
      image,
      url: image?.url ?? row.imageUrl,
      caption: row.caption,
      altText: row.altText,
      takenOn: row.takenOn === null ? null : formatDateOnly(row.takenOn),
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function snapshot(row: ItemRow): Record<string, unknown> {
  return {
    mediaAssetId: row.mediaAssetId,
    caption: row.caption,
    altText: row.altText,
    takenOn: row.takenOn === null ? null : formatDateOnly(row.takenOn),
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
  };
}
