import { PII_MASK, diffSnapshots, toJsonValue } from './audit-snapshot';

describe('снимки для журнала действий', () => {
  test('ПДн жертвователя маскируются на любой глубине', () => {
    // Arrange
    const donation = {
      id: 'd1',
      amountKopecks: 10_000n,
      contact: { phoneE164: '+79991234567', fullName: 'Усман Усманов', consentIp: '10.0.0.1' },
    };

    // Act
    const json = JSON.stringify(toJsonValue(donation));

    // Assert
    expect(json).not.toContain('79991234567');
    expect(json).not.toContain('Усман');
    expect(json).not.toContain('10.0.0.1');
    expect(json).toContain(PII_MASK);
    expect(json).toContain('"amountKopecks":"10000"');
  });

  test('пароли и токены не попадают в журнал', () => {
    // Act
    const json = JSON.stringify(toJsonValue({ password: 'secret-1', passwordHash: '$2b$', refreshToken: 'rt' }));

    // Assert
    expect(json).not.toMatch(/secret-1|\$2b\$|"rt"/);
  });

  test('пустое значение ПДн остаётся null — видно, что поля не было', () => {
    // Assert
    expect(toJsonValue({ phone: null })).toEqual({ phone: null });
  });

  test('e-mail пользователя админки можно разрешить явно', () => {
    // Act
    const json = toJsonValue({ email: 'admin@x.ru' }, { allowKeys: ['email'] });

    // Assert
    expect(json).toEqual({ email: 'admin@x.ru' });
  });

  test('дифф содержит только изменившиеся поля', () => {
    // Act
    const diff = diffSnapshots(
      { title: 'Фундамент', status: 'current', budgetKopecks: 100n },
      { title: 'Фундамент', status: 'done', budgetKopecks: 100n },
    );

    // Assert
    expect(diff).toEqual({ before: { status: 'current' }, after: { status: 'done' } });
  });

  test('создание и удаление пишут состояние целиком', () => {
    // Assert
    expect(diffSnapshots(undefined, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
    expect(diffSnapshots({ a: 1 }, undefined)).toEqual({ before: { a: 1 }, after: null });
  });
});
