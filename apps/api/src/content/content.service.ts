import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { MEDIA_ASSET_SELECT, toPublicImage } from '../media/media-urls';
import type { PublicImage } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { RevalidationService } from '../revalidation/revalidation.service';
import { normalizeBlock } from './content-normalize';
import { CONTENT_BLOCK_KEYS, MEDIA_FIELDS } from './content.types';
import type {
  AdminContentBlockResponse,
  ContentBlockKey,
  ContentBlocks,
  PublicContentResponse,
} from './content.types';

/** Блок → JSON для Prisma. Типы блоков readonly, а InputJsonValue — нет; через JSON — без потерь. */
function toJsonObject(data: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
}

function mediaIdsOf(key: ContentBlockKey, data: unknown): readonly string[] {
  const record = data as Readonly<Record<string, unknown>>;

  return MEDIA_FIELDS[key]
    .map((field) => record[field])
    .filter((value): value is string => typeof value === 'string');
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  /** Все блоки для сайта: id картинок заменены готовыми ссылками. */
  async getPublic(): Promise<PublicContentResponse> {
    const rows = await this.prisma.contentBlock.findMany();
    const blocks = new Map(rows.map((row) => [row.key, row]));
    const read = <K extends ContentBlockKey>(key: K): ContentBlocks[K] | null => {
      const row = blocks.get(key);

      return row === undefined ? null : normalizeBlock(key, row.data);
    };

    const hero = read('hero');
    const about = read('about');
    const requisites = read('requisites');
    const images = await this.loadImages([
      hero?.renderMediaId,
      about?.facadeMediaId,
      requisites?.sbpQrMediaId,
    ]);
    const image = (id: string | null | undefined): PublicImage | null =>
      id === null || id === undefined ? null : (images.get(id) ?? null);
    const updatedAt = rows.reduce<Date | null>(
      (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    );

    return {
      hero: hero === null ? null : { ...hero, render: image(hero.renderMediaId), renderUrl: image(hero.renderMediaId)?.url ?? null },
      about:
        about === null ? null : { ...about, facade: image(about.facadeMediaId), facadeUrl: image(about.facadeMediaId)?.url ?? null },
      requisites: requisites === null ? null : { ...requisites, sbpQrUrl: image(requisites.sbpQrMediaId)?.url ?? null },
      contacts: read('contacts'),
      faq: read('faq'),
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  async listAdmin(): Promise<readonly AdminContentBlockResponse[]> {
    const rows = await this.prisma.contentBlock.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return CONTENT_BLOCK_KEYS.flatMap((key) => {
      const row = byKey.get(key);

      return row === undefined ? [] : [this.toAdmin(key, row)];
    });
  }

  async getAdmin<K extends ContentBlockKey>(key: K): Promise<AdminContentBlockResponse<K>> {
    const row = await this.prisma.contentBlock.findUnique({ where: { key } });

    if (row === null) {
      throw new NotFoundException(`Блок «${key}» ещё не заполнен — запустите сиды`);
    }

    return this.toAdmin(key, row);
  }

  /**
   * Замена блока целиком. Тело уже прошло DTO своего ключа; здесь — проверка,
   * что картинки существуют в медиатеке, журнал и ревалидация тега `content`.
   */
  async update<K extends ContentBlockKey>(
    key: K,
    body: object,
    actor: AdminPrincipal,
    meta: RequestMeta,
  ): Promise<AdminContentBlockResponse<K>> {
    const data = normalizeBlock(key, body);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertMediaExists(tx, mediaIdsOf(key, data));

      const before = await tx.contentBlock.findUnique({ where: { key } });
      const saved = await tx.contentBlock.upsert({
        where: { key },
        create: { key, data: toJsonObject(data), updatedById: actor.id },
        update: { data: toJsonObject(data), updatedById: actor.id },
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'content.update',
        entityType: 'content_block',
        entityId: key,
        before: before === null ? undefined : normalizeBlock(key, before.data),
        after: data,
        meta,
      });

      return this.toAdmin(key, saved);
    });

    void this.revalidation.notify(['content']);

    return result;
  }

  private async assertMediaExists(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const found = await tx.mediaAsset.count({ where: { id: { in: [...ids] } } });

    if (found !== new Set(ids).size) {
      throw new BadRequestException('Картинка не найдена в медиатеке');
    }
  }

  private async loadImages(ids: readonly (string | null | undefined)[]): Promise<Map<string, PublicImage>> {
    const wanted = ids.filter((id): id is string => typeof id === 'string');

    if (wanted.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: wanted } }, select: MEDIA_ASSET_SELECT });

    return new Map(assets.map((asset) => [asset.id, toPublicImage(this.storage, asset)]));
  }

  private toAdmin<K extends ContentBlockKey>(
    key: K,
    row: { data: unknown; updatedAt: Date; updatedById: string | null },
  ): AdminContentBlockResponse<K> {
    return { key, data: normalizeBlock(key, row.data), updatedAt: row.updatedAt.toISOString(), updatedById: row.updatedById };
  }
}
