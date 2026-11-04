import { ApiExcludeController, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { userActor } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { ADMIN_THROTTLE } from '../auth/auth.constants';
import type { AdminPrincipal, RequestMeta } from '../auth/auth.types';
import { CurrentAdmin, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ReqMeta } from '../auth/request-meta';
import { TAX_CERTIFICATE_ROLES } from '../auth/roles';
import { TrimToNull } from '../common/dto-transforms';
import { PageQueryDto, pageArgs } from '../common/pagination';
import type { Page } from '../common/pagination';
import { PrismaService } from '../database/prisma.service';
import { DonationStatus, TaxCertificateStatus } from '../generated/prisma/enums';
import { yearBounds } from '../subscriptions/billing-calendar';

export class AdminTaxCertificatesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: TaxCertificateStatus })
  @IsOptional()
  @IsEnum(TaxCertificateStatus)
  status?: TaxCertificateStatus;
}

export class UpdateTaxCertificateDto {
  @ApiPropertyOptional({ enum: TaxCertificateStatus })
  @IsOptional()
  @IsEnum(TaxCertificateStatus)
  status?: TaxCertificateStatus;

  @ApiPropertyOptional({ nullable: true, description: 'Комментарий жертвователю — виден в кабинете' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_dto: unknown, value: unknown) => value !== null)
  @IsString()
  @MaxLength(500)
  adminComment?: string | null;
}

export class AdminTaxCertificateResponse {
  @ApiProperty() readonly id!: string;
  @ApiProperty() readonly year!: number;
  @ApiProperty({ enum: TaxCertificateStatus }) readonly status!: TaxCertificateStatus;
  @ApiPropertyOptional({ nullable: true }) readonly adminComment!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'ФИО из профиля' }) readonly donorName!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly donorEmail!: string | null;
  @ApiPropertyOptional({ nullable: true }) readonly donorPhone!: string | null;
  @ApiProperty({ description: 'Успешные пожертвования из кабинета за год, копейки строкой' })
  readonly paidTotalKopecks!: string;
  @ApiProperty() readonly paidCount!: number;
  @ApiProperty() readonly createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) readonly doneAt!: string | null;
}

/**
 * Заявки на справку для вычета — для бухгалтера. Права — `TAX_CERTIFICATE_ROLES`
 * (суперадмин и бухгалтер): тут ФИО, почта и суммы человека, маски нет.
 */
@Injectable()
export class AdminTaxCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminTaxCertificatesQueryDto): Promise<Page<AdminTaxCertificateResponse>> {
    const where = query.status === undefined ? {} : { status: query.status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.taxCertificateRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        ...pageArgs(query),
        include: {
          donor: {
            select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phoneE164: true, timezone: true },
          },
        },
      }),
      this.prisma.taxCertificateRequest.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (row) => {
        const bounds = yearBounds(row.year, row.donor.timezone);
        const totals = await this.prisma.donation.aggregate({
          where: { userId: row.donor.id, status: DonationStatus.paid, paidAt: { gte: bounds.from, lt: bounds.to } },
          _sum: { paidAmountKopecks: true },
          _count: { _all: true },
        });
        const name = [row.donor.lastName, row.donor.firstName, row.donor.middleName].filter(Boolean).join(' ');

        return {
          id: row.id,
          year: row.year,
          status: row.status,
          adminComment: row.adminComment,
          donorName: name.length > 0 ? name : null,
          donorEmail: row.donor.email,
          donorPhone: row.donor.phoneE164,
          paidTotalKopecks: (totals._sum.paidAmountKopecks ?? 0n).toString(),
          paidCount: totals._count._all,
          createdAt: row.createdAt.toISOString(),
          doneAt: row.doneAt?.toISOString() ?? null,
        };
      }),
    );

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Статус и комментарий. Журнал — в той же транзакции. */
  async update(id: string, dto: UpdateTaxCertificateDto, admin: AdminPrincipal, meta: RequestMeta): Promise<{ id: string }> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.taxCertificateRequest.findUnique({
        where: { id },
        select: { status: true, adminComment: true },
      });

      if (before === null) {
        throw new NotFoundException('Заявка не найдена');
      }

      const status = dto.status ?? before.status;

      await tx.taxCertificateRequest.update({
        where: { id },
        data: {
          status,
          ...(dto.adminComment === undefined ? {} : { adminComment: dto.adminComment }),
          doneAt: status === TaxCertificateStatus.DONE ? new Date() : null,
        },
      });
      await this.audit.record(tx, {
        actor: userActor(admin),
        action: 'tax_certificate.update',
        entityType: 'tax_certificate_request',
        entityId: id,
        before,
        after: { status, adminComment: dto.adminComment ?? before.adminComment },
        meta,
      });
    });

    return { id };
  }
}

/** Админка в Swagger кабинета не попадает — он только про `/donor/*`. */
@ApiExcludeController()
@Controller('admin/tax-certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({ default: ADMIN_THROTTLE })
export class AdminTaxCertificatesController {
  constructor(private readonly service: AdminTaxCertificatesService) {}

  @Get()
  @Roles(...TAX_CERTIFICATE_ROLES)
  list(@Query() query: AdminTaxCertificatesQueryDto): Promise<Page<AdminTaxCertificateResponse>> {
    return this.service.list(query);
  }

  @Patch(':id')
  @Roles(...TAX_CERTIFICATE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCertificateDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ id: string }> {
    return this.service.update(id, dto, admin, meta);
  }
}
