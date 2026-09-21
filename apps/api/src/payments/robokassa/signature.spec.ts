import { PaymentHashAlgorithm } from '../../config/env.validation';
import {
  OutSumParseError,
  buildInitSignatureSource,
  buildResultSignatureSource,
  formatOutSum,
  formatShpParams,
  hashSignature,
  parseOutSumToKopecks,
  signaturesMatch,
} from './signature';

/**
 * Подпись — единственное место платёжного модуля, где ошибка не видна
 * ни в типах, ни в логах: провайдер просто отвергает каждый платёж,
 * а причину не сообщает. Поэтому состав строки зафиксирован тестом.
 *
 * Эталонные хеши посчитаны отдельно от кода под тестом.
 */
const MERCHANT = 'demo';
const PASSWORD_1 = 'password_1';
const PASSWORD_2 = 'password_2';

describe('строка подписи', () => {
  test('ссылка на оплату: MerchantLogin:OutSum:InvId:Пароль#1', () => {
    // Act
    const source = buildInitSignatureSource({
      merchantLogin: MERCHANT,
      outSum: '100.00',
      invId: '42',
      password: PASSWORD_1,
    });

    // Assert
    expect(source).toBe('demo:100.00:42:password_1');
  });

  test('с чеком Receipt встаёт перед паролем', () => {
    // Arrange: значение уже URL-кодировано — так требует документация
    const receipt = encodeURIComponent('{"sno":"usn_income"}');

    // Act
    const source = buildInitSignatureSource({
      merchantLogin: MERCHANT,
      outSum: '100.00',
      invId: '42',
      receipt,
      password: PASSWORD_1,
    });

    // Assert
    expect(source).toBe(`demo:100.00:42:${receipt}:password_1`);
  });

  test('колбэк: OutSum:InvId:Пароль#2', () => {
    // Act
    const source = buildResultSignatureSource({
      outSum: '100.00',
      invId: '42',
      password: PASSWORD_2,
    });

    // Assert
    expect(source).toBe('100.00:42:password_2');
  });

  test('Shp_-параметры дописываются в конец строго по алфавиту', () => {
    // Arrange: порядок обязан совпасть с тем, в каком их пересобирает
    // Robokassa, — иначе подпись не сойдётся, а отладить это нечем
    const shp = { Shp_region: '02', Shp_anon: '1', Shp_campaign: 'shamil' };

    // Act
    const source = buildResultSignatureSource({
      outSum: '100.00',
      invId: '42',
      password: PASSWORD_2,
      shp,
    });

    // Assert
    expect(formatShpParams(shp)).toEqual(['Shp_anon=1', 'Shp_campaign=shamil', 'Shp_region=02']);
    expect(source).toBe('100.00:42:password_2:Shp_anon=1:Shp_campaign=shamil:Shp_region=02');
  });
});

describe('хеш подписи', () => {
  test('md5 считается по эталонному значению', () => {
    // Act
    const signature = hashSignature('demo:100.00:42:password_1', PaymentHashAlgorithm.Md5);

    // Assert
    expect(signature).toBe('42a60c45cd1a722d91aee889c3d5f59c');
  });

  test('переключение на sha256 меняет только хеш, не строку', () => {
    // Act
    const signature = hashSignature('demo:100.00:42:password_1', PaymentHashAlgorithm.Sha256);

    // Assert
    expect(signature).toBe(
      '5c84cb668c69c33078f4faf95e627e59e3d954628b71dbfbf57e3c01179795a0',
    );
  });

  test('колбэк с Shp_ даёт эталонный хеш', () => {
    // Act
    const signature = hashSignature(
      '100.00:42:password_2:Shp_region=02',
      PaymentHashAlgorithm.Md5,
    );

    // Assert
    expect(signature).toBe('6709d1cc1d64b1f978ad912a48d5b651');
  });
});

describe('сравнение подписей', () => {
  const EXPECTED = '26f30947013e19685eda7f3ea6e94c99';

  test('регистр не важен: Robokassa отдаёт hex в верхнем', () => {
    // Assert
    expect(signaturesMatch(EXPECTED, EXPECTED.toUpperCase())).toBe(true);
  });

  test('пробелы по краям не ломают сравнение', () => {
    // Assert
    expect(signaturesMatch(EXPECTED, ` ${EXPECTED} `)).toBe(true);
  });

  test('другая подпись не проходит', () => {
    // Assert
    expect(signaturesMatch(EXPECTED, EXPECTED.replace(/^2/, '3'))).toBe(false);
  });

  test('подпись другой длины не проходит и не роняет сравнение', () => {
    // Arrange: timingSafeEqual на разной длине бросает исключение
    const act = (): boolean => signaturesMatch(EXPECTED, 'коротко');

    // Assert
    expect(act()).toBe(false);
  });

  test('пустая подпись не проходит', () => {
    // Assert
    expect(signaturesMatch(EXPECTED, '')).toBe(false);
  });
});

describe('суммы', () => {
  test('копейки превращаются в рубли с двумя знаками', () => {
    // Assert
    expect(formatOutSum(10_000n)).toBe('100.00');
    expect(formatOutSum(1n)).toBe('0.01');
    expect(formatOutSum(24_000_000_000n)).toBe('240000000.00');
  });

  test('сумма из колбэка разбирается обратно в копейки', () => {
    // Assert
    expect(parseOutSumToKopecks('100.00')).toBe(10_000n);
    // Robokassa присылает шесть знаков — так в её же примерах
    expect(parseOutSumToKopecks('100.000000')).toBe(10_000n);
    expect(parseOutSumToKopecks('0.01')).toBe(1n);
    expect(parseOutSumToKopecks('1000')).toBe(100_000n);
    expect(parseOutSumToKopecks('100,50')).toBe(10_050n);
  });

  test('сумма переживает оборот без потери копейки', () => {
    // Arrange: 0.1 + 0.2 в double не равно 0.3 — на деньгах сбора такое
    // расхождение копится и разводит сайт с выпиской банка
    const amounts = [1n, 10_000n, 49_999n, 123_456_789n, 24_000_000_000n];

    // Act & Assert
    for (const amount of amounts) {
      expect(parseOutSumToKopecks(formatOutSum(amount))).toBe(amount);
    }
  });

  test('значащие знаки после копеек — ошибка, а не повод округлить', () => {
    // Assert
    expect(() => parseOutSumToKopecks('100.005')).toThrow(OutSumParseError);
  });

  test('мусор вместо суммы не превращается в ноль', () => {
    // Assert: parseFloat вернул бы NaN, Number('') — ноль; и то и другое
    // записало бы донат на неверную сумму
    expect(() => parseOutSumToKopecks('')).toThrow(OutSumParseError);
    expect(() => parseOutSumToKopecks('сто рублей')).toThrow(OutSumParseError);
    expect(() => parseOutSumToKopecks('-100.00')).toThrow(OutSumParseError);
    expect(() => parseOutSumToKopecks('1e3')).toThrow(OutSumParseError);
  });
});
