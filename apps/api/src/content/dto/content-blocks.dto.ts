import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { Trim, TrimToNull } from '../../common/dto-transforms';

/**
 * Структура блоков главной. Каждое поле — то, что сейчас захардкожено во фронте
 * (`apps/web/lib/content.ts`, `lib/organization.ts`), с теми же именами:
 * фронт заменяет константу ответом API без переделки компонентов.
 *
 * Тексты — простые строки, без HTML: сайт выводит их как текст.
 * Хадисы, слоган, юридические реквизиты организации (наименование, ИНН, ОГРН)
 * здесь отсутствуют намеренно (D-10).
 */

const notNull = (_dto: unknown, value: unknown): boolean => value !== null;

export class HeroBlockDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  badge!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  lede!: string;

  /** Короткий лид для телефона. */
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  ledeShort!: string;

  /** Пункты доверия под заголовком. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  trust!: string[];

  /** Рендер мечети из медиатеки; `null` — блок без картинки. */
  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID()
  renderMediaId?: string | null;

  @Trim()
  @IsString()
  @MaxLength(160)
  renderCaption!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  helpButton!: string;
}

export class ProjectFactDto {
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(40)
  value?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(16)
  unit?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(120)
  label?: string | null;
}

export class AboutBlockDto {
  @Trim()
  @IsString()
  @MaxLength(60)
  eyebrow!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  /** Абзац «о проекте». `null` — сайт абзац не выводит. */
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(3000)
  text?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID()
  facadeMediaId?: string | null;

  @Trim()
  @IsString()
  @MaxLength(160)
  facadeCaption!: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProjectFactDto)
  facts!: ProjectFactDto[];
}

/**
 * Реквизиты расчётного счёта (только SUPER_ADMIN, D-17). Форматы — банковские:
 * ошибка в одной цифре — это перевод в никуда, поэтому проверяется длина и цифры.
 * `null` — реквизит ещё не известен, сайт пишет «уточняется».
 */
export class RequisitesBlockDto {
  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{20}$/, { message: 'accountNumber — 20 цифр расчётного счёта' })
  accountNumber?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(200)
  bankName?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{9}$/, { message: 'bik — 9 цифр' })
  bik?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{20}$/, { message: 'correspondentAccount — 20 цифр' })
  correspondentAccount?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{9}$/, { message: 'kpp — 9 цифр' })
  kpp?: string | null;

  /** QR СБП из медиатеки. */
  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID()
  sbpQrMediaId?: string | null;
}

export class ContactsBlockDto {
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @Matches(/^\+?[0-9 ()-]{5,30}$/, { message: 'phone — цифры, пробелы, скобки, дефис, +' })
  phone?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  /** Имя канала без @: `mechetshamil`. */
  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @Matches(/^[A-Za-z0-9_]{5,32}$/, { message: 'telegramChannel — имя канала без @, 5–32 символа' })
  telegramChannel?: string | null;

  @IsOptional()
  @TrimToNull()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(300)
  mosqueAddress?: string | null;
}

export class FaqItemDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  question!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  answer!: string;
}

/** FAQ хранится, но сайт его пока не выводит (D-11). */
export class FaqBlockDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  items!: FaqItemDto[];
}
