import { IMAGE_VARIANTS } from './image-processor';
import type { ImageVariantSize } from './image-processor';
import type { StorageDriver } from './storage/storage.types';

/** Поля `media_asset`, по которым строятся ссылки. */
export interface MediaAssetRow {
  readonly id: string;
  readonly storageKey: string;
  readonly width: number;
  readonly height: number;
  readonly altText: string | null;
}

export type MediaUrls = Readonly<Record<ImageVariantSize, string>>;

/** Публичная картинка медиатеки — то, что получает сайт. */
export interface PublicImage {
  /** Крупный вариант (до 1920 px по ширине). */
  readonly url: string;
  readonly urls: MediaUrls;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

export function variantKey(storageKey: string, size: ImageVariantSize): string {
  return `${storageKey}-${size}.webp`;
}

export function variantKeys(storageKey: string): readonly string[] {
  return IMAGE_VARIANTS.map((variant) => variantKey(storageKey, variant.size));
}

export function mediaUrls(storage: StorageDriver, storageKey: string): MediaUrls {
  return {
    sm: storage.publicUrl(variantKey(storageKey, 'sm')),
    md: storage.publicUrl(variantKey(storageKey, 'md')),
    lg: storage.publicUrl(variantKey(storageKey, 'lg')),
  };
}

export function toPublicImage(storage: StorageDriver, asset: MediaAssetRow): PublicImage {
  const urls = mediaUrls(storage, asset.storageKey);

  return { url: urls.lg, urls, width: asset.width, height: asset.height, alt: asset.altText };
}

export const MEDIA_ASSET_SELECT = {
  id: true,
  storageKey: true,
  width: true,
  height: true,
  altText: true,
} as const;
