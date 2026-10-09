/* eslint-disable @next/next/no-img-element -- превью в админке уже ужаты API (WebP 480 px), оптимизатор Next им не нужен, а домен медиа в dev и проде разный */

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
}

/** Картинка из медиатеки в админке: ленивая загрузка, размеры против прыжков вёрстки. */
export function AdminImage({ src, alt, width, height, className }: Props) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
