/**
 * Ссылка на видео → адрес плеера для `<iframe>` (D-13).
 *
 * Принимаются только https-ссылки на точный список доменов. Embed-адрес
 * собирается из разобранного идентификатора, а не из присланной строки:
 * в iframe сайта не попадёт ничего, кроме плееров трёх площадок.
 */

export type VideoProvider = 'vk' | 'rutube' | 'youtube';

export interface ParsedVideoUrl {
  readonly provider: VideoProvider;
  readonly sourceUrl: string;
  readonly embedUrl: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const RUTUBE_HOSTS = new Set(['rutube.ru', 'www.rutube.ru']);
const VK_HOSTS = new Set(['vk.com', 'www.vk.com', 'm.vk.com', 'vkvideo.ru', 'www.vkvideo.ru', 'm.vkvideo.ru']);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const RUTUBE_ID = /^[0-9a-f]{32}$/;
/** `video-123456_456239017`: владелец (у сообществ — с минусом) и номер ролика. */
const VK_VIDEO_PATH = /^\/(?:video|clip)(-?\d{1,20})_(\d{1,20})\/?$/;
const VK_INT = /^-?\d{1,20}$/;
const VK_HASH = /^[0-9a-f]{1,32}$/;

export class VideoUrlError extends Error {}

export function parseVideoUrl(raw: string): ParsedVideoUrl {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    throw new VideoUrlError('Это не ссылка');
  }

  if (url.protocol !== 'https:') {
    throw new VideoUrlError('Нужна ссылка https://');
  }

  if (url.username !== '' || url.password !== '' || url.port !== '') {
    throw new VideoUrlError('Ссылка с логином или портом не принимается');
  }

  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    return parseYoutube(url, host);
  }

  if (RUTUBE_HOSTS.has(host)) {
    return parseRutube(url);
  }

  if (VK_HOSTS.has(host)) {
    return parseVk(url);
  }

  throw new VideoUrlError('Поддерживаются только VK Видео, Rutube и YouTube');
}

function parseYoutube(url: URL, host: string): ParsedVideoUrl {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const id =
    host === 'youtu.be'
      ? segments[0]
      : segments[0] === 'watch'
        ? url.searchParams.get('v') ?? undefined
        : segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live'
          ? segments[1]
          : undefined;

  if (id === undefined || !YOUTUBE_ID.test(id)) {
    throw new VideoUrlError('Не найден идентификатор ролика YouTube');
  }

  return {
    provider: 'youtube',
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    // Домен без cookie: плеер не ставит рекламные cookie посетителю до клика.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
  };
}

function parseRutube(url: URL): ParsedVideoUrl {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const id =
    segments[0] === 'video' ? segments[1] : segments[0] === 'play' && segments[1] === 'embed' ? segments[2] : undefined;

  if (id === undefined || !RUTUBE_ID.test(id)) {
    throw new VideoUrlError('Не найден идентификатор ролика Rutube');
  }

  return {
    provider: 'rutube',
    sourceUrl: `https://rutube.ru/video/${id}/`,
    embedUrl: `https://rutube.ru/play/embed/${id}`,
  };
}

/**
 * VK: `vk.com/video-1_2`, `vkvideo.ru/video-1_2`, `vk.com/video_ext.php?oid=-1&id=2&hash=…`.
 * Для закрытых роликов плееру нужен `hash` — его можно взять только из кода
 * встраивания VK. **[проверить]** формат на реальном ролике (D-13).
 */
function parseVk(url: URL): ParsedVideoUrl {
  let ownerId: string | undefined;
  let videoId: string | undefined;

  if (url.pathname === '/video_ext.php') {
    ownerId = url.searchParams.get('oid') ?? undefined;
    videoId = url.searchParams.get('id') ?? undefined;
  } else {
    const match = VK_VIDEO_PATH.exec(url.pathname) ?? VK_VIDEO_PATH.exec(`/${url.searchParams.get('z') ?? ''}`);

    ownerId = match?.[1];
    videoId = match?.[2];
  }

  if (ownerId === undefined || videoId === undefined || !VK_INT.test(ownerId) || !VK_INT.test(videoId)) {
    throw new VideoUrlError('Не найден идентификатор ролика VK');
  }

  const hash = url.searchParams.get('hash');
  const embed = new URL('https://vk.com/video_ext.php');

  embed.searchParams.set('oid', ownerId);
  embed.searchParams.set('id', videoId);

  if (hash !== null) {
    if (!VK_HASH.test(hash)) {
      throw new VideoUrlError('Некорректный hash в ссылке VK');
    }

    embed.searchParams.set('hash', hash);
  }

  return {
    provider: 'vk',
    sourceUrl: `https://vk.com/video${ownerId}_${videoId}`,
    embedUrl: embed.toString(),
  };
}
