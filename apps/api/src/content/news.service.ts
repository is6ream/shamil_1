import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { userActor } from '../audit/audit.types';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { Page, PageQueryDto } from '../common/pagination';
import { pageArgs } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import { isUniqueViolation } from '../database/prisma-errors';
import type { Prisma } from '../generated/prisma/client';
import { NewsStatus } from '../generated/prisma/enums';
import { MEDIA_ASSET_SELECT, toPublicImage } from '../media/media-urls';
import type { PublicImage } from '../media/media-urls';
import { STORAGE_DRIVER } from '../media/storage/storage.types';
import type { StorageDriver } from '../media/storage/storage.types';
import { RevalidationService } from '../revalidation/revalidation.service';
import type { AdminNewsQueryDto, CreateNewsDto, UpdateNewsDto } from './dto/news.dto';
import { findMarkdownProblem } from './markdown-safety';
import { SLUG_MAX_LENGTH, slugify } from './slug';

export interface PublicNewsListItem {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly cover: PublicImage | null;
  readonly publishedAt: string;
}

export interface PublicNewsPost extends PublicNewsListItem {
  /** Markdown без HTML — рендерить без raw HTML. */
  readonly bodyMarkdown: string;
}

export interface AdminNewsPost {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string | null;
  readonly bodyMarkdown: string;
  readonly coverMediaId: string | null;
  readonly cover: PublicImage | null;
  readonly status: NewsStatus;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const POST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  bodyMarkdown: true,
  coverMediaId: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  cover: { select: MEDIA_ASSET_SELECT },
} as const satisfies Prisma.NewsPostSelect;

type PostRow = Prisma.NewsPostGetPayload<{ select: typeof POST_SELECT }>;

/** Сколько номеров перебрать, подбирая свободный слаг `заголовок-2`, `-3`… */
const SLUG_ATTEMPTS = 50;

function assertSafeBody(body: string | undefined): void {
  const problem = body === undefined ? null : findMarkdownProblem(body);

  if (problem !== null) {
    throw new BadRequestException(problem);
  }
}

function snapshot(row: PostRow): Record<string, unknown> {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    // Сам текст в журнал не кладём: он большой, а для разбора хватает длины.
    bodyLength: row.bodyMarkdown.length,
    coverMediaId: row.coverMediaId,
    status: row.status,
    publishedAt: row.publishedAt,
  };
}

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async listPublished(query: PageQueryDto): Promise<Page<PublicNewsListItem>> {
    const where = { status: NewsStatus.published } as const;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.newsPost.findMany({
        where,
        select: POST_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.newsPost.count({ where }),
    ]);

    return { items: rows.map((row) => this.toPublicListItem(row)), total, page: query.page, pageSize: query.pageSize };
  }

  async getPublished(slug: string): Promise<PublicNewsPost> {
    const row = await this.prisma.newsPost.findFirst({ where: { slug, status: NewsStatus.published }, select: POST_SELECT });

    if (row === null) {
      // Черновик для сайта не существует — тот же 404, что и для неизвестного слага.
      throw new NotFoundException('Новость не найдена');
    }

    return { ...this.toPublicListItem(row), bodyMarkdown: row.bodyMarkdown };
  }

  async listAdmin(query: AdminNewsQueryDto): Promise<Page<AdminNewsPost>> {
    const where = query.status === undefined ? {} : { status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.newsPost.findMany({
        where,
        select: POST_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.newsPost.count({ where }),
    ]);

    return { items: rows.map((row) => this.toAdmin(row)), total, page: query.page, pageSize: query.pageSize };
  }

  async getAdmin(id: string): Promise<AdminNewsPost> {
    return this.toAdmin(await this.load(this.prisma, id));
  }

  async create(dto: CreateNewsDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminNewsPost> {
    assertSafeBody(dto.bodyMarkdown);

    const status = dto.status ?? NewsStatus.draft;
    const result = await this.withSlugConflict(() =>
      this.prisma.$transaction(async (tx) => {
        await this.assertCover(tx, dto.coverMediaId);

        const created = await tx.newsPost.create({
          data: {
            slug: dto.slug ?? (await this.freeSlug(tx, slugify(dto.title))),
            title: dto.title,
            excerpt: dto.excerpt ?? null,
            bodyMarkdown: dto.bodyMarkdown,
            coverMediaId: dto.coverMediaId ?? null,
            status,
            publishedAt: status === NewsStatus.published ? new Date() : null,
            createdById: actor.id,
          },
          select: POST_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'news.create',
          entityType: 'news_post',
          entityId: created.id,
          after: snapshot(created),
          meta,
        });

        return this.toAdmin(created);
      }),
    );

    void this.revalidation.notify(['news']);

    return result;
  }

  async update(id: string, dto: UpdateNewsDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminNewsPost> {
    assertSafeBody(dto.bodyMarkdown);

    const result = await this.withSlugConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await this.load(tx, id);

        await this.assertCover(tx, dto.coverMediaId);

        const publishing = dto.status === NewsStatus.published && before.status !== NewsStatus.published;
        const unpublishing = dto.status === NewsStatus.draft && before.status === NewsStatus.published;
        const updated = await tx.newsPost.update({
          where: { id },
          data: {
            ...(dto.title === undefined ? {} : { title: dto.title }),
            ...(dto.slug === undefined ? {} : { slug: dto.slug }),
            ...(dto.excerpt === undefined ? {} : { excerpt: dto.excerpt }),
            ...(dto.bodyMarkdown === undefined ? {} : { bodyMarkdown: dto.bodyMarkdown }),
            ...(dto.coverMediaId === undefined ? {} : { coverMediaId: dto.coverMediaId }),
            ...(dto.status === undefined ? {} : { status: dto.status }),
            ...(publishing ? { publishedAt: new Date() } : {}),
            ...(unpublishing ? { publishedAt: null } : {}),
          },
          select: POST_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: publishing ? 'news.publish' : unpublishing ? 'news.unpublish' : 'news.update',
          entityType: 'news_post',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
          meta,
        });

        return this.toAdmin(updated);
      }),
    );

    void this.revalidation.notify(['news']);

    return result;
  }

  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);

      await tx.newsPost.delete({ where: { id } });
      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'news.delete',
        entityType: 'news_post',
        entityId: id,
        before: snapshot(before),
        meta,
      });
    });

    void this.revalidation.notify(['news']);
  }

  private async withSlugConflict<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Новость с таким адресом (slug) уже есть');
      }

      throw error;
    }
  }

  /** Свободный слаг: `zalivka-fundamenta`, затем `-2`, `-3`… */
  private async freeSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
    for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
      const taken = await tx.newsPost.findUnique({ where: { slug: candidate }, select: { id: true } });

      if (taken === null) {
        return candidate;
      }
    }

    throw new ConflictException('Не удалось подобрать свободный адрес — задайте slug вручную');
  }

  private async load(db: PrismaService | Prisma.TransactionClient, id: string): Promise<PostRow> {
    const row = await db.newsPost.findUnique({ where: { id }, select: POST_SELECT });

    if (row === null) {
      throw new NotFoundException('Новость не найдена');
    }

    return row;
  }

  private async assertCover(tx: Prisma.TransactionClient, coverMediaId: string | null | undefined): Promise<void> {
    if (coverMediaId === undefined || coverMediaId === null) {
      return;
    }

    const found = await tx.mediaAsset.findUnique({ where: { id: coverMediaId }, select: { id: true } });

    if (found === null) {
      throw new BadRequestException('Обложка не найдена в медиатеке');
    }
  }

  private toPublicListItem(row: PostRow): PublicNewsListItem {
    if (row.publishedAt === null) {
      // CHECK news_post_published_at_consistency не даёт этому случиться.
      throw new Error(`Опубликованная новость ${row.id} без даты публикации`);
    }

    return {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      cover: row.cover === null ? null : toPublicImage(this.storage, row.cover),
      publishedAt: row.publishedAt.toISOString(),
    };
  }

  private toAdmin(row: PostRow): AdminNewsPost {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      bodyMarkdown: row.bodyMarkdown,
      coverMediaId: row.coverMediaId,
      cover: row.cover === null ? null : toPublicImage(this.storage, row.cover),
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
