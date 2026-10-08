import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { ReorderDto } from '../common/dto-transforms';
import { kopecksToString, parseKopecks } from '../common/kopecks';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { ConstructionStageStatus } from '../generated/prisma/enums';
import { MEDIA_ASSET_SELECT, toPublicImage } from '../media/media-urls';
import type { PublicImage } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { CreateStageDto, UpdateStageDto } from './dto/stage.dto';

/**
 * Потолок суммы этапа — 2,4 млрд ₽ (десять целей сбора). Граница против
 * лишнего нуля в форме, а не против реальной сметы.
 */
export const MAX_STAGE_KOPECKS = 240_000_000_000n;

/** Этап на сайте. Форма совместима с `ConstructionStage` фронта (+ новые поля). */
export interface PublicStageResponse {
  readonly id: string;
  readonly title: string;
  readonly status: ConstructionStageStatus;
  /** Смета этапа (то, что фронт называет `amountKopecks`). */
  readonly amountKopecks: string | null;
  readonly spentKopecks: string | null;
  readonly description: string | null;
  readonly photos: readonly PublicImage[];
}

export interface PublicConstructionResponse {
  /** Последняя правка этапов, ISO-8601; `null`, пока этапов нет. */
  readonly updatedAt: string | null;
  readonly stages: readonly PublicStageResponse[];
}

export interface AdminStageResponse extends PublicStageResponse {
  readonly budgetKopecks: string | null;
  readonly photoMediaIds: readonly string[];
  readonly sortOrder: number;
  readonly updatedAt: string;
}

const STAGE_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  budgetKopecks: true,
  spentKopecks: true,
  sortOrder: true,
  updatedAt: true,
  photos: { select: { mediaAsset: { select: MEDIA_ASSET_SELECT } }, orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.ConstructionStageSelect;

type StageRow = Prisma.ConstructionStageGetPayload<{ select: typeof STAGE_SELECT }>;

const SORT_STEP = 10;

function optionalKopecks(value: string | null | undefined, field: string): bigint | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return parseKopecks(value, MAX_STAGE_KOPECKS, field);
}

function snapshot(row: StageRow): Record<string, unknown> {
  return {
    title: row.title,
    description: row.description,
    status: row.status,
    budgetKopecks: row.budgetKopecks,
    spentKopecks: row.spentKopecks,
    sortOrder: row.sortOrder,
    photoMediaIds: row.photos.map((photo) => photo.mediaAsset.id),
  };
}

@Injectable()
export class StagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async getPublic(): Promise<PublicConstructionResponse> {
    const rows = await this.findAll();
    const updatedAt = rows.reduce<Date | null>(
      (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    );

    return { updatedAt: updatedAt?.toISOString() ?? null, stages: rows.map((row) => this.toPublic(row)) };
  }

  async listAdmin(): Promise<readonly AdminStageResponse[]> {
    return (await this.findAll()).map((row) => this.toAdmin(row));
  }

  async create(dto: CreateStageDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminStageResponse> {
    const budgetKopecks = optionalKopecks(dto.budgetKopecks, 'budgetKopecks');
    const spentKopecks = optionalKopecks(dto.spentKopecks, 'spentKopecks');
    const result = await this.prisma.$transaction(async (tx) => {
      await this.assertMedia(tx, dto.photoMediaIds ?? []);

      const last = await tx.constructionStage.aggregate({ _max: { sortOrder: true } });
      const created = await tx.constructionStage.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          ...(dto.status === undefined ? {} : { status: dto.status }),
          budgetKopecks: budgetKopecks ?? null,
          spentKopecks: spentKopecks ?? null,
          sortOrder: dto.sortOrder ?? (last._max.sortOrder ?? 0) + SORT_STEP,
          photos: {
            create: (dto.photoMediaIds ?? []).map((mediaAssetId, index) => ({ mediaAssetId, sortOrder: index })),
          },
        },
        select: STAGE_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'stage.create',
        entityType: 'construction_stage',
        entityId: created.id,
        after: snapshot(created),
        meta,
      });

      return this.toAdmin(created);
    });

    void this.revalidation.notify(['stages']);

    return result;
  }

  async update(id: string, dto: UpdateStageDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminStageResponse> {
    const budgetKopecks = optionalKopecks(dto.budgetKopecks, 'budgetKopecks');
    const spentKopecks = optionalKopecks(dto.spentKopecks, 'spentKopecks');
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);

      if (dto.photoMediaIds !== undefined) {
        await this.assertMedia(tx, dto.photoMediaIds);
        await tx.constructionStagePhoto.deleteMany({ where: { stageId: id } });
        await tx.constructionStagePhoto.createMany({
          data: dto.photoMediaIds.map((mediaAssetId, index) => ({ stageId: id, mediaAssetId, sortOrder: index })),
        });
      }

      const updated = await tx.constructionStage.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(budgetKopecks === undefined ? {} : { budgetKopecks }),
          ...(spentKopecks === undefined ? {} : { spentKopecks }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
          // Смена одних фото тоже двигает «обновлено» на сайте.
          updatedAt: new Date(),
        },
        select: STAGE_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'stage.update',
        entityType: 'construction_stage',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
        meta,
      });

      return this.toAdmin(updated);
    });

    void this.revalidation.notify(['stages']);

    return result;
  }

  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);

      await tx.constructionStage.delete({ where: { id } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'stage.delete',
        entityType: 'construction_stage',
        entityId: id,
        before: snapshot(before),
        meta,
      });
    });

    void this.revalidation.notify(['stages']);
  }

  async reorder(dto: ReorderDto, actor: AdminPrincipal, meta: RequestMeta): Promise<readonly AdminStageResponse[]> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.constructionStage.findMany({ select: { id: true } });
      const known = new Set(existing.map((row) => row.id));

      if (dto.ids.length !== known.size || !dto.ids.every((id) => known.has(id))) {
        throw new BadRequestException('ids — все этапы ровно по одному разу');
      }

      for (const [index, id] of dto.ids.entries()) {
        await tx.constructionStage.update({ where: { id }, data: { sortOrder: (index + 1) * SORT_STEP } });
      }

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'stage.reorder',
        entityType: 'construction_stage',
        after: { ids: dto.ids },
        meta,
      });
    });

    void this.revalidation.notify(['stages']);

    return this.listAdmin();
  }

  private findAll(): Promise<StageRow[]> {
    return this.prisma.constructionStage.findMany({
      select: STAGE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async load(tx: Prisma.TransactionClient, id: string): Promise<StageRow> {
    const row = await tx.constructionStage.findUnique({ where: { id }, select: STAGE_SELECT });

    if (row === null) {
      throw new NotFoundException('Этап не найден');
    }

    return row;
  }

  private async assertMedia(tx: Prisma.TransactionClient, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const found = await tx.mediaAsset.count({ where: { id: { in: [...ids] } } });

    if (found !== ids.length) {
      throw new BadRequestException('Фото этапа не найдено в медиатеке');
    }
  }

  private toPublic(row: StageRow): PublicStageResponse {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      amountKopecks: kopecksToString(row.budgetKopecks),
      spentKopecks: kopecksToString(row.spentKopecks),
      description: row.description,
      photos: row.photos.map((photo) => toPublicImage(this.storage, photo.mediaAsset)),
    };
  }

  private toAdmin(row: StageRow): AdminStageResponse {
    return {
      ...this.toPublic(row),
      budgetKopecks: kopecksToString(row.budgetKopecks),
      photoMediaIds: row.photos.map((photo) => photo.mediaAsset.id),
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
