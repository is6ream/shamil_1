import styles from "./gallery.module.css";

/**
 * Предпросмотр ролика. `embedUrl` собирает сервер по allowlist (API.md §9),
 * но iframe всё равно в песочнице: без форм, всплывающих окон и навигации
 * верхнего окна, без реферера дальше домена.
 */
export function VideoEmbed({ embedUrl, title }: { readonly embedUrl: string; readonly title: string }) {
  return (
    <div className={styles.embed}>
      <iframe
        src={embedUrl}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
