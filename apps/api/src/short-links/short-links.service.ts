import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { userActor } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import type { AppConfig } from '../config/configuration';
import { isUniqueViolation } from '../database/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateShortLinkDto, UpdateShortLinkDto } from './dto/short-link.dto';
import {
  PREVIEW_BOT_PATTERN,
  SHORT_LINK_LIST_LIMIT,
  SHORT_LINK_SITE_PREFIX,
  SHORT_LINK_SLUG_MAX_LENGTH,
  SHORT_LINK_SLUG_PATTERN,
} from './short-links.constants';

const SHORT_LINK_SELECT = {
  id: true,
  slug: true,
  title: true,
  targetPath: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
  clicks: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShortLinkSelect;

type ShortLinkRow = Prisma.ShortLinkGetPayload<{ select: typeof SHORT_LINK_SELECT }>;

/** Куда ведёт ссылка: путь и метки. Ровно то, что нужно редиректу. */
interface RedirectTarget {
  readonly targetPath: string;
  readonly utmSource: string;
  readonly utmMedium: string | null;
  readonly utmCampaign: string | null;
  readonly utmContent: string | null;
  readonly utmTerm: string | null;
}

export interface AdminShortLink {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly targetPath: string;
  readonly utm: {
    readonly source: string;
    readonly medium: string | null;
    readonly campaign: string | null;
    readonly content: string | null;
    readonly term: string | null;
  };
  readonly clicks: number;
  readonly isActive: boolean;
  /** `https://mechetshamil.ru/go/<slug>` — это печатают в QR. */
  readonly shortUrl: string;
  /** Куда ссылка ведёт на самом деле, с метками. */
  readonly targetUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ShortLinkList {
  readonly items: readonly AdminShortLink[];
}

const UTM_PARAMS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
] as const;

/** Превью мессенджера или поисковик — не человек: клик не считаем. Пустой UA — тоже. */
export function isPreviewBot(userAgent: string | undefined): boolean {
  return userAgent === undefined || userAgent.trim().length === 0 || PREVIEW_BOT_PATTERN.test(userAgent);
}

function snapshot(row: ShortLinkRow): Record<string, unknown> {
  return {
    slug: row.slug,
    title: row.title,
    targetPath: row.targetPath,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    utmContent: row.utmContent,
    utmTerm: row.utmTerm,
    isActive: row.isActive,
  };
}

/**
 * Короткие ссылки для QR и соцсетей.
 *
 * Редирект ведёт только на свой сайт: адрес собирается из `PUBLIC_SITE_URL`
 * и пути, который база пропускает только как путь (CHECK
 * `short_link_target_path_format`). Подставить чужой домен нельзя ни через
 * админку, ни через URL запроса.
 */
@Injectable()
export class ShortLinksService {
  private readonly logger = new Logger(ShortLinksService.name);
  private readonly siteUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.siteUrl = config.get('publicUrls', { infer: true }).siteUrl;
  }

  /** Главная сайта — туда ведёт неизвестная, выключенная или сломанная ссылка. */
  get homeUrl(): string {
    return `${this.siteUrl}/`;
  }

  /**
   * Адрес редиректа по слагу. Никогда не бросает: человек, отсканировавший
   * QR со старого баннера, должен попасть на сайт, а не на страницу ошибки.
   */
  async resolveRedirect(slug: string, userAgent: string | undefined): Promise<string> {
    if (slug.length > SHORT_LINK_SLUG_MAX_LENGTH || !SHORT_LINK_SLUG_PATTERN.test(slug)) {
      return this.homeUrl;
    }

    try {
      const target = isPreviewBot(userAgent) ? await this.findActive(slug) : await this.countClick(slug);

      return target === null ? this.homeUrl : this.buildTargetUrl(target);
    } catch (error: unknown) {
      // Сбой базы не должен ломать QR: ведём на главную, а причину — в лог.
      // В лог уходит только слаг: user-agent и IP здесь не нужны.
      this.logger.error(`Редирект короткой ссылки «${slug}» не удался: ${String(error)}`);

      return this.homeUrl;
    }
  }

  async list(): Promise<ShortLinkList> {
    const rows = await this.prisma.shortLink.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: SHORT_LINK_LIST_LIMIT,
      select: SHORT_LINK_SELECT,
    });

    return { items: rows.map((row) => this.toAdmin(row)) };
  }

  async get(id: string): Promise<AdminShortLink> {
    return this.toAdmin(await this.load(this.prisma, id));
  }

  async create(dto: CreateShortLinkDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminShortLink> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.shortLink.create({
          data: {
            slug: dto.slug,
            title: dto.title,
            ...(dto.targetPath === undefined ? {} : { targetPath: dto.targetPath }),
            utmSource: dto.utmSource,
            utmMedium: dto.utmMedium ?? null,
            utmCampaign: dto.utmCampaign ?? null,
            utmContent: dto.utmContent ?? null,
            utmTerm: dto.utmTerm ?? null,
            ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          },
          select: SHORT_LINK_SELECT,
        });

        await this.audit.record(tx, {
          actor: userActor(actor),
          action: 'short_link.create',
          entityType: 'short_link',
          entityId: row.id,
          after: snapshot(row),
          meta,
        });

        return row;
      });

      return this.toAdmin(created);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ссылка /go/${dto.slug} уже есть — выберите другой адрес`);
      }

      throw error;
    }
  }

  async update(id: string, dto: UpdateShortLinkDto, actor: AdminPrincipal, meta: RequestMeta): Promise<AdminShortLink> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);
      const row = await tx.shortLink.update({
        where: { id },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.targetPath === undefined ? {} : { targetPath: dto.targetPath }),
          ...(dto.utmSource === undefined ? {} : { utmSource: dto.utmSource }),
          ...(dto.utmMedium === undefined ? {} : { utmMedium: dto.utmMedium }),
          ...(dto.utmCampaign === undefined ? {} : { utmCampaign: dto.utmCampaign }),
          ...(dto.utmContent === undefined ? {} : { utmContent: dto.utmContent }),
          ...(dto.utmTerm === undefined ? {} : { utmTerm: dto.utmTerm }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
        },
        select: SHORT_LINK_SELECT,
      });

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'short_link.update',
        entityType: 'short_link',
        entityId: id,
        before: snapshot(before),
        after: snapshot(row),
        meta,
      });

      return row;
    });

    return this.toAdmin(updated);
  }

  /**
   * Удалить можно только ссылку, по которой никто не переходил: опечатку,
   * заведённую минуту назад. Ссылку с кликами уже напечатали — её выключают.
   */
  async remove(id: string, actor: AdminPrincipal, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.load(tx, id);
      // Условие на clicks — в самом DELETE: клик между чтением и удалением
      // не должен проскочить.
      const deleted = await tx.shortLink.deleteMany({ where: { id, clicks: 0 } });

      if (deleted.count === 0) {
        throw new ConflictException('По ссылке уже переходили — выключите её, а не удаляйте: QR мог быть напечатан');
      }

      await this.audit.record(tx, {
        actor: userActor(actor),
        action: 'short_link.delete',
        entityType: 'short_link',
        entityId: id,
        before: snapshot(before),
        meta,
      });
    });
  }

  /** Инкремент и чтение одним UPDATE: два одновременных клика не теряют друг друга. */
  private async countClick(slug: string): Promise<RedirectTarget | null> {
    const rows = await this.prisma.$queryRaw<RedirectTarget[]>`
      UPDATE "short_link" SET "clicks" = "clicks" + 1
       WHERE "slug" = ${slug} AND "is_active"
      RETURNING "target_path" AS "targetPath", "utm_source" AS "utmSource", "utm_medium" AS "utmMedium",
                "utm_campaign" AS "utmCampaign", "utm_content" AS "utmContent", "utm_term" AS "utmTerm"`;

    return rows[0] ?? null;
  }

  private findActive(slug: string): Promise<RedirectTarget | null> {
    return this.prisma.shortLink.findFirst({
      where: { slug, isActive: true },
      select: {
        targetPath: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
      },
    });
  }

  private buildTargetUrl(target: RedirectTarget): string {
    const url = new URL(target.targetPath, `${this.siteUrl}/`);

    for (const [param, field] of UTM_PARAMS) {
      const value = target[field];

      if (value !== null) {
        url.searchParams.set(param, value);
      }
    }

    return url.toString();
  }

  private async load(db: PrismaService | Prisma.TransactionClient, id: string): Promise<ShortLinkRow> {
    const row = await db.shortLink.findUnique({ where: { id }, select: SHORT_LINK_SELECT });

    if (row === null) {
      throw new NotFoundException('Короткая ссылка не найдена');
    }

    return row;
  }

  private toAdmin(row: ShortLinkRow): AdminShortLink {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      targetPath: row.targetPath,
      utm: {
        source: row.utmSource,
        medium: row.utmMedium,
        campaign: row.utmCampaign,
        content: row.utmContent,
        term: row.utmTerm,
      },
      clicks: row.clicks,
      isActive: row.isActive,
      shortUrl: `${this.siteUrl}${SHORT_LINK_SITE_PREFIX}${row.slug}`,
      targetUrl: this.buildTargetUrl(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
