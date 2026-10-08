import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { Metadata } from 'sharp';

import { detectImageFormat } from './image-signature';

/**
 * Варианты, в которые пережимается каждое фото. Ширины — под сетку сайта:
 * превью галереи, карточка, полноэкранный просмотр. Меньше исходного не растягиваем.
 */
export const IMAGE_VARIANTS = [
  { size: 'sm', width: 480 },
  { size: 'md', width: 1024 },
  { size: 'lg', width: 1920 },
] as const;

export type ImageVariantSize = (typeof IMAGE_VARIANTS)[number]['size'];

export const WEBP_CONTENT_TYPE = 'image/webp';

/** Качество WebP: на фото стройки разница с 90 не видна, вес — вдвое меньше. */
const WEBP_QUALITY = 80;

/**
 * Потолок пикселей на входе — защита от «бомбы» (маленький файл, гигантские
 * размеры, десятки гигабайт памяти при декодировании). 50 Мп — больше любой
 * камеры телефона.
 */
const MAX_INPUT_PIXELS = 50_000_000;

export interface ProcessedVariant {
  readonly size: ImageVariantSize;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly buffer: Buffer;
}

/**
 * Фото с телефона → WebP трёх размеров.
 *
 * EXIF, XMP и ICC вырезаются: sharp не переносит метаданные, пока его об этом
 * не попросили (`withMetadata` не вызывается). В EXIF телефонного снимка —
 * GPS-координаты и модель телефона. Ориентация из EXIF перед этим применяется
 * к пикселям (`rotate()` без аргументов), иначе снимок «лёг бы на бок».
 */
@Injectable()
export class ImageProcessor {
  async process(input: Buffer): Promise<readonly ProcessedVariant[]> {
    const declared = detectImageFormat(input);

    if (declared === null) {
      throw new BadRequestException('Поддерживаются только JPEG, PNG и WebP');
    }

    const metadata = await this.readMetadata(input);

    if (metadata.format !== declared) {
      // Сигнатура одного формата, содержимое другого — это не фото с телефона.
      throw new BadRequestException('Содержимое файла не совпадает с его форматом');
    }

    try {
      return await Promise.all(IMAGE_VARIANTS.map((variant) => this.render(input, variant.size, variant.width)));
    } catch {
      // Заголовок прочитался, а тело битое — файл обрезан или повреждён.
      throw new BadRequestException('Файл повреждён или это не изображение');
    }
  }

  private async render(input: Buffer, size: ImageVariantSize, width: number): Promise<ProcessedVariant> {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return { size, width: info.width, height: info.height, bytes: info.size, buffer: data };
  }

  private async readMetadata(input: Buffer): Promise<Metadata> {
    try {
      return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).metadata();
    } catch {
      // Причину sharp наружу не отдаём: она про внутренности libvips, а не про файл.
      throw new BadRequestException('Файл повреждён или это не изображение');
    }
  }
}
