import { VideoUrlError, parseVideoUrl } from './video-url';

describe('ссылки на видео (D-13)', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
  ])('YouTube: %s', (input, embed) => {
    // Act
    const parsed = parseVideoUrl(input);

    // Assert
    expect(parsed).toEqual({ provider: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embedUrl: embed });
  });

  test('Rutube: страница ролика и embed', () => {
    // Arrange
    const id = '0123456789abcdef0123456789abcdef';

    // Act & Assert
    expect(parseVideoUrl(`https://rutube.ru/video/${id}/`).embedUrl).toBe(`https://rutube.ru/play/embed/${id}`);
    expect(parseVideoUrl(`https://rutube.ru/play/embed/${id}`).provider).toBe('rutube');
  });

  test.each([
    'https://vk.com/video-12345_456239017',
    'https://vkvideo.ru/video-12345_456239017',
    'https://vk.com/video_ext.php?oid=-12345&id=456239017',
    'https://vk.com/videos-12345?z=video-12345_456239017',
  ])('VK: %s', (input) => {
    // Act
    const parsed = parseVideoUrl(input);

    // Assert
    expect(parsed.provider).toBe('vk');
    expect(parsed.embedUrl).toBe('https://vk.com/video_ext.php?oid=-12345&id=456239017');
  });

  test('VK: hash закрытого ролика переносится в embed', () => {
    // Act
    const parsed = parseVideoUrl('https://vk.com/video_ext.php?oid=1&id=2&hash=abcdef0123');

    // Assert
    expect(parsed.embedUrl).toBe('https://vk.com/video_ext.php?oid=1&id=2&hash=abcdef0123');
  });

  test.each([
    ['чужой домен', 'https://evil.example/watch?v=dQw4w9WgXcQ'],
    ['похожий домен', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['http без TLS', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['javascript:', 'javascript:alert(1)'],
    ['логин в ссылке', 'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['порт', 'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ'],
    ['кривой id YouTube', 'https://www.youtube.com/watch?v=<script>'],
    ['кривой id Rutube', 'https://rutube.ru/video/not-an-id/'],
    ['VK без ролика', 'https://vk.com/id1'],
    ['VK с мусором в hash', 'https://vk.com/video_ext.php?oid=1&id=2&hash=%22onload'],
    ['не ссылка', 'просто текст'],
  ])('отклоняется: %s', (_name, input) => {
    // Act
    const act = (): unknown => parseVideoUrl(input);

    // Assert
    expect(act).toThrow(VideoUrlError);
  });
});
