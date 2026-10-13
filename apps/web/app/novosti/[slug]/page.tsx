import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/content/Markdown";
import { SimplePage } from "@/components/layout/SimplePage";
import styles from "@/components/news/News.module.css";
import { getNewsArticle } from "@/lib/api/site-content";
import { PAGES } from "@/lib/content";
import { formatDayMonth } from "@/lib/format";

/** Новости меняются редко; публикация в админке сбрасывает кеш тегом `news`. */
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/novosti/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getNewsArticle(slug).catch(() => null);

  if (article === null) {
    return { title: "Новость не найдена" };
  }

  return {
    title: article.title,
    description: article.excerpt ?? undefined,
    openGraph: {
      title: article.title,
      description: article.excerpt ?? undefined,
      ...(article.cover ? { images: [{ url: article.cover.urls.lg }] } : {}),
    },
  };
}

/**
 * Новость стройки (D-12). Текст — markdown без HTML, тем же компонентом,
 * что предпросмотр в админке. Черновик или снятая с публикации — 404.
 */
export default async function NewsPage({ params }: PageProps<"/novosti/[slug]">) {
  const { slug } = await params;
  const article = await getNewsArticle(slug);

  if (article === null) {
    notFound();
  }

  return (
    <SimplePage title={article.title}>
      <p className={styles.meta}>
        <time dateTime={article.publishedAt}>{formatDayMonth(article.publishedAt)}</time>
      </p>
      {article.cover ? (
        <Image
          className={styles.cover}
          src={article.cover.urls.lg}
          alt={article.cover.alt ?? ""}
          width={article.cover.width}
          height={article.cover.height}
          sizes="(min-width: 768px) 720px, 100vw"
        />
      ) : null}
      <Markdown text={article.bodyMarkdown} />
      <Link className={styles.back} href={PAGES.reports.href}>
        ← Все новости и отчёты
      </Link>
    </SimplePage>
  );
}
