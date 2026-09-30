import type { NextConfig } from "next";

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
  },
};

export default nextConfig;
