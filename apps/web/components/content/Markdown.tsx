import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

import styles from "./Markdown.module.css";

/**
 * Текст новости: markdown без HTML (D-12, API.md §12). `skipHtml` выкидывает
 * HTML-узлы, `rehype-raw` не подключаем никогда; опасные схемы ссылок
 * режет `defaultUrlTransform` react-markdown (а сервер — ещё при сохранении).
 * Один компонент на сайт и на предпросмотр в админке — вид совпадает.
 */

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const isExternal = href !== undefined && /^https?:\/\//i.test(href);

    return (
      <a href={href} {...(isExternal ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
        {children}
      </a>
    );
  },
  // Картинки в тексте — только как ссылки: без размеров они ломают вёрстку,
  // а фото новостей живут в обложке и медиатеке.
  img: ({ src, alt }) =>
    typeof src === "string" ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt || "Изображение"}
      </a>
    ) : null,
};

export function Markdown({ text }: { readonly text: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown skipHtml components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
