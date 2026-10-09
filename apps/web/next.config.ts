import type { NextConfig } from "next";

/**
 * Откуда `next/image` может брать фото из админки: публичный адрес медиа
 * (`NEXT_PUBLIC_MEDIA_URL` — домен S3-бакета или `${API}/media`) и сам API
 * для dev, где медиа отдаёт Nest (D-16). Пустые и битые адреса пропускаем:
 * без них сайт работает на текущих картинках.
 */
function mediaPatterns(): URL[] {
  const sources = [process.env.NEXT_PUBLIC_MEDIA_URL, process.env.NEXT_PUBLIC_API_URL];

  return sources.flatMap((source) => {
    if (source === undefined || source.trim() === "") {
      return [];
    }

    try {
      const url = new URL(source);

      return [new URL(`${url.origin}${url.pathname.replace(/\/$/, "")}/**`)];
    } catch {
      return [];
    }
  });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Версия сборки в заголовке ответа мешает больше, чем помогает.
  poweredByHeader: false,
  // Просмотр dev-сервера с телефона по локальной сети: Next 16 иначе режет
  // скрипты и HMR с чужого адреса. Список IP — в DEV_ALLOWED_ORIGINS через запятую.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Стройка снимается на телефон: тяжёлые JPEG отдаём в современных форматах.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: mediaPatterns(),
  },
  // Админка не индексируется. В robots.txt её не перечисляем: Disallow
  // помешал бы роботу увидеть noindex и выдал бы адрес входа.
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
