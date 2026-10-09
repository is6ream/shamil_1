import { CSV_SEPARATOR, csvCell, csvRow, formatExportDate, kopecksToRubles } from './csv';

describe('CSV для бухгалтера', () => {
  test('разделитель, кавычки и переводы строк экранируются', () => {
    // Assert
    expect(csvCell('просто')).toBe('просто');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('две\nстроки')).toBe('"две\nстроки"');
    expect(csvCell(null)).toBe('');
    expect(csvRow(['a', 1, null])).toBe(`a${CSV_SEPARATOR}1${CSV_SEPARATOR}\r\n`);
  });

  test('формула в подписи донатера не исполняется Excel', () => {
    // Assert
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+79991234567')).toBe("'+79991234567");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  test('копейки → рубли с десятичной запятой', () => {
    // Assert
    expect(kopecksToRubles(10_000n)).toBe('100,00');
    expect(kopecksToRubles(123_456n)).toBe('1234,56');
    expect(kopecksToRubles(5n)).toBe('0,05');
    expect(kopecksToRubles(null)).toBeNull();
  });

  test('время — по Уфе, в формате, который понимает Excel', () => {
    // Assert: 09:00 UTC = 14:00 в Уфе (UTC+5)
    expect(formatExportDate(new Date('2026-10-08T09:00:00.000Z'))).toBe('2026-10-08 14:00:00');
  });
});
