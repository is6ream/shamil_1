import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { readRefreshCookie, refreshCookieOptions } from './refresh-cookie';

describe('cookie refresh-токена', () => {
  test('значение находится среди других cookie', () => {
    // Arrange
    const request = { headers: { cookie: `theme=dark; ${REFRESH_COOKIE_NAME}=abc-123_X; other=1` } };

    // Act
    const token = readRefreshCookie(request);

    // Assert
    expect(token).toBe('abc-123_X');
  });

  test('нет cookie — null', () => {
    // Assert
    expect(readRefreshCookie({ headers: {} })).toBeNull();
    expect(readRefreshCookie({ headers: { cookie: 'theme=dark' } })).toBeNull();
    expect(readRefreshCookie({ headers: { cookie: `${REFRESH_COOKIE_NAME}=` } })).toBeNull();
  });

  test('битое percent-кодирование не роняет разбор', () => {
    // Assert
    expect(readRefreshCookie({ headers: { cookie: `${REFRESH_COOKIE_NAME}=%E0%A4%A` } })).toBeNull();
  });

  test('httpOnly, SameSite=Strict и узкий путь; Secure — по флагу', () => {
    // Act
    const production = refreshCookieOptions(true);
    const local = refreshCookieOptions(false);

    // Assert
    expect(production).toMatchObject({ httpOnly: true, sameSite: 'strict', path: REFRESH_COOKIE_PATH, secure: true });
    expect(local.secure).toBe(false);
  });
});
