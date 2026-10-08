import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { normalizeBlock } from './content-normalize';
import { ContactsBlockDto, HeroBlockDto, RequisitesBlockDto } from './dto/content-blocks.dto';
import { findMarkdownProblem } from './markdown-safety';
import { slugify } from './slug';

function errorsOf<T extends object>(cls: new () => T, body: object): string[] {
  return validateSync(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true }).map(
    (error) => error.property,
  );
}

describe('безопасный markdown новостей', () => {
  test('обычный markdown проходит', () => {
    // Arrange
    const body =
      '# Залили фундамент\n\nСпасибо всем! > цитата\n\n- пункт\n\n[Отчёт](https://mechetshamil.ru/otchety) ' +
      '![фото](https://s3.timeweb.cloud/b/x.webp) [почта](mailto:a@b.ru) [тел](tel:+79170000000) 2 < 3';

    // Assert
    expect(findMarkdownProblem(body)).toBeNull();
  });

  test.each([
    ['тег script', 'Текст <script>alert(1)</script>'],
    ['img с onerror', '<img src=x onerror=alert(1)>'],
    ['закрывающий тег', 'a </div> b'],
    ['комментарий', '<!-- скрыто -->'],
    ['autolink', '<https://example.com>'],
    ['javascript: в ссылке', '[жми](javascript:alert(1))'],
    ['javascript: в картинке', '![x](JaVaScRiPt:alert(1))'],
    ['data: в ссылке', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['схема, спрятанная сущностью', '[x](jav&#x09;ascript:alert(1))'],
    ['схема с пробелом', '[x]( javascript:alert(1))'],
    ['сноска-ссылка', '[x]\n\n[x]: vbscript:msgbox'],
  ])('отклоняется: %s', (_name, body) => {
    // Assert
    expect(findMarkdownProblem(body)).not.toBeNull();
  });
});

describe('слаг новости', () => {
  test('кириллица транслитерируется, мусор срезается', () => {
    // Assert
    expect(slugify('Залили фундамент!')).toBe('zalili-fundament');
    expect(slugify('  Отчёт за сентябрь 2026 — расходы  ')).toBe('otchet-za-sentyabr-2026-rashody');
    expect(slugify('Шәһәр')).toBe('shahar');
    expect(slugify('!!!')).toBe('novost');
  });

  test('слаг не длиннее 120 символов и не кончается дефисом', () => {
    // Act
    const slug = slugify('слово '.repeat(60));

    // Assert
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('DTO блоков главной', () => {
  const hero = {
    badge: 'Идёт сбор',
    title: 'Построим мечеть',
    lede: 'Лид',
    ledeShort: 'Коротко',
    trust: ['Пункт'],
    renderMediaId: null,
    renderCaption: '',
    helpButton: 'Помочь',
  };

  test('корректный hero проходит', () => {
    // Assert
    expect(errorsOf(HeroBlockDto, hero)).toEqual([]);
  });

  test('лишнее поле (например, хадис) — ошибка, а не молчаливый пропуск', () => {
    // Assert
    expect(errorsOf(HeroBlockDto, { ...hero, hadith: 'текст' })).toContain('hadith');
  });

  test('реквизиты проверяются по банковским форматам', () => {
    // Assert
    expect(errorsOf(RequisitesBlockDto, { accountNumber: '40703810000000000001', bik: '048073601', kpp: '027401001' })).toEqual(
      [],
    );
    expect(errorsOf(RequisitesBlockDto, { accountNumber: '4070381000000000000' })).toContain('accountNumber');
    expect(errorsOf(RequisitesBlockDto, { bik: '04807360a' })).toContain('bik');
  });

  test('контакты: канал Telegram без @, e-mail по формату', () => {
    // Assert
    expect(errorsOf(ContactsBlockDto, { telegramChannel: 'mechetshamil', email: 'a@b.ru' })).toEqual([]);
    expect(errorsOf(ContactsBlockDto, { telegramChannel: '@mechetshamil' })).toContain('telegramChannel');
    expect(errorsOf(ContactsBlockDto, { email: 'не почта' })).toContain('email');
  });

  test('нормализация отбрасывает лишние ключи и проставляет null', () => {
    // Act
    const contacts = normalizeBlock('contacts', { phone: '+7 917', extra: 'x' });

    // Assert
    expect(contacts).toEqual({ phone: '+7 917', email: null, telegramChannel: null, mosqueAddress: null });
  });
});
