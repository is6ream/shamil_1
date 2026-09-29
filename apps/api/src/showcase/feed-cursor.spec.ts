import { FeedCursorError, decodeFeedCursor, encodeFeedCursor } from './feed-cursor';

const ID = '5b0c3f7e-8a3d-4c1e-9f00-1234567890ab';

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

describe('курсор ленты', () => {
  test('кодирование и разбор — обратимы', () => {
    // Arrange
    const cursor = { paidAt: new Date('2026-09-21T11:32:00.123Z'), id: ID };

    // Act
    const decoded = decodeFeedCursor(encodeFeedCursor(cursor));

    // Assert
    expect(decoded).toEqual(cursor);
  });

  test('курсор — URL-безопасная строка', () => {
    expect(encodeFeedCursor({ paidAt: new Date(), id: ID })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test.each([
    ['мусор', '!!!'],
    ['не JSON', base64url('hello')],
    ['JSON без полей', base64url('{}')],
    ['битая дата', base64url(JSON.stringify({ paidAt: 'вчера', id: ID }))],
    ['не uuid', base64url(JSON.stringify({ paidAt: '2026-09-21T11:32:00Z', id: "1' OR 1=1" }))],
    ['массив', base64url('[1,2]')],
  ])('%s → FeedCursorError', (_name, raw) => {
    expect(() => decodeFeedCursor(raw)).toThrow(FeedCursorError);
  });
});
