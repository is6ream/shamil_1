import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { ReorderDto } from '../common/dto-transforms';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { MEDIA_ASSET_SELECT, toPublicImage } from '../media/media-urls';
import type { PublicImage } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { CreateVideoDto, UpdateVideoDto } from './dto/video.dto';
import { VideoUrlError, parseVideoUrl } from './video-url';
import type { ParsedVideoUrl, VideoProvider } from './video-url';

/** Видео на сайте: только опубликованные, по порядку. */
export interface PublicVideoResponse {
  readonly id: string;
  readonly provider: VideoProvider;
  readonly embedUrl: string;
  readonly sourceUrl: string;
  readonly title: string | null;
  readonly poster: PublicImage | null;
}

export interface AdminVideoResponse extends PublicVideoResponse {
  readonly posterMediaId: string | null;
  readonly isPublished: boolean;
  readonly sortOrder: number;
  readonly updatedAt: string;
}

const VIDEO_SELECT = {
  id: true,
  provider: true,
  sourceUrl: true,
  embedUrl: true,
  title: true,
  posterMediaId: true,
  isPublished: true,
  sortOrder: true,
  updatedAt: true,
  poster: { select: MEDIA_ASSET_SELECT },
} as const;

type VideoRow = Prisma.VideoLinkGetPayload<{ select: typeof VIDEO_SELECT }>;

const SORT_STEP = 10;

function parseOrReject(url: string): ParsedVideoUrl {
  try {
    return parseVideoUrl(url);
  } catch (error: unknown) {
    if (error instanceof VideoUrlError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}

const PROVIDERS: readonly VideoProvider[] = ['vk', 'rutube', 'youtube'];

/** Значение из БД; CHECK `video_link_provider_allowed` держит тот же список. */
function toProvider(value: string): VideoProvider {
  const provider = PROVIDERS.find((known) => known === value);

  if (provider === undefined) {
    throw new Error(`Неизвестная площадка видео в БД: ${value}`);
  }

  return provider;
}

function snapshot(row: VideoRow): Record<string, unknown> {
  return {
    provider: row.provider,
    sourceUrl: row.sourceUrl,
    title: row.title,
    posterMediaId: row.posterMediaId,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
  };
}

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async listPublished(): Promise<readonly PublicVideoResponse[]> {
    const rows = await this.prisma.videoLink.findMany({
      where: { isPublished: true },
      select: VIDEO_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => this.toPublic(row));
  }

  async listAll(): Promise<readonly AdminVideoResponse[]> {
    const rows = await this.prisma.videoLink.findMany({
      select: VIDEO_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => this.toAdmin(row));
  }

  async create(dto: CreateVideoDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminVideoResponse> {
    const parsed = parseOrReject(dto.url);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertPoster(tx, dto.posterMediaId);

      const last = await tx.videoLink.aggregate({ _max: { sortOrder: true } });
      const created = await tx.videoLink.create({
        data: {
          ...parsed,
          title: dto.title ?? null,
          posterMediaId: dto.posterMediaId ?? null,
          isPublished: dto.isPublished ?? true,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + SORT_STEP,
        },
        select: VIDEO_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'video.create',
        entityType: 'video_link',
        entityId: created.id,
        after: snapshot(created),
        meta,
      });

      return this.toAdmin(created);
    });

    void this.revalidation.notify(['video']);

    return result;
  }

  async update(id: string, dto: UpdateVideoDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminVideoResponse> {
    const parsed = dto.url === undefined ? undefined : parseOrReject(dto.url);
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);

      await this.assertPoster(tx, dto.posterMediaId);

      const updated = await tx.videoLink.update({
        where: { id },
        data: {
          ...(parsed ?? {}),
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.posterMediaId === undefined ? {} : { posterMediaId: dto.posterMediaId }),
          ...(dto.isPublished === undefined ? {} : { isPublished: dto.isPublished }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        },
        select: VIDEO_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'video.update',
        entityType: 'video_link',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
        meta,
      });

      return this.toAdmin(updated);
    });

    void this.revalidation.notify(['video']);

    return result;
  }

  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);

      await tx.videoLink.delete({ where: { id } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'video.delete',
        entityType: 'video_link',
        entityId: id,
        before: snapshot(before),
        meta,
      });
    });

    void this.revalidation.notify(['video']);
  }

  async reorder(dto: ReorderDto, actor: AdminPrincipal, meta: RequestMeta): Promise<readonly AdminVideoResponse[]> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.videoLink.findMany({ select: { id: true } });
      const known = new Set(existing.map((row) => row.id));

      if (dto.ids.length !== known.size || !dto.ids.every((id) => known.has(id))) {
        throw new BadRequestException('ids — все видео ровно по одному разу');
      }

      for (const [index, id] of dto.ids.entries()) {
        await tx.videoLink.update({ where: { id }, data: { sortOrder: (index + 1) * SORT_STEP } });
      }

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'video.reorder',
        entityType: 'video_link',
        after: { ids: dto.ids },
        meta,
      });
    });

    void this.revalidation.notify(['video']);

    return this.listAll();
  }

  private async load(tx: Prisma.TransactionClient, id: string): Promise<VideoRow> {
    const row = await tx.videoLink.findUnique({ where: { id }, select: VIDEO_SELECT });

    if (row === null) {
      throw new NotFoundException('Видео не найдено');
    }

    return row;
  }

  private async assertPoster(tx: Prisma.TransactionClient, posterMediaId: string | null | undefined): Promise<void> {
    if (posterMediaId === undefined || posterMediaId === null) {
      return;
    }

    const found = await tx.mediaAsset.findUnique({ where: { id: posterMediaId }, select: { id: true } });

    if (found === null) {
      throw new BadRequestException('Постер не найден в медиатеке');
    }
  }

  private toPublic(row: VideoRow): PublicVideoResponse {
    return {
      id: row.id,
      provider: toProvider(row.provider),
      embedUrl: row.embedUrl,
      sourceUrl: row.sourceUrl,
      title: row.title,
      poster: row.poster === null ? null : toPublicImage(this.storage, row.poster),
    };
  }

  private toAdmin(row: VideoRow): AdminVideoResponse {
    return {
      ...this.toPublic(row),
      posterMediaId: row.posterMediaId,
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
