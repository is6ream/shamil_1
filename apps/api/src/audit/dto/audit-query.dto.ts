import { IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../common/pagination';

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** Точное имя действия (`donation.manual_create`) или префикс со звёздочкой (`donation.*`). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z_]+(\.[a-z_]+|\.\*)?$/, { message: 'action — например donation.manual_create или donation.*' })
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z_]+$/, { message: 'entityType — латиница в нижнем регистре и _' })
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  entityId?: string;

  /** Начало периода включительно, ISO-8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Конец периода не включительно, ISO-8601. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
