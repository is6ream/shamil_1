import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Версия сборки в заголовке ответа мешает больше, чем помогает.
  poweredByHeader: false,
  // Стройка снимается на телефон: тяжёлые JPEG отдаём в современных форматах.
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
