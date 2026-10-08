import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

import { IMAGE_VARIANTS, ImageProcessor } from './image-processor';
import { detectImageFormat } from './image-signature';
import { newStorageKey, sanitizeOriginalName } from './media.service';

/** JPEG 3000×2000 с EXIF (модель телефона) — как снимок с телефона. */
async function phoneJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 51, b: 103 } } })
    .jpeg()
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'Secret Model 9' } })
    .toBuffer();
}

describe('сигнатуры изображений', () => {
  test('JPEG, PNG и WebP узнаются по первым байтам', async () => {
    // Arrange
    const base = sharp({ create: { width: 4, height: 4, channels: 3, background: '#026AA9' } });

    // Act & Assert
    expect(detectImageFormat(await base.clone().jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageFormat(await base.clone().png().toBuffer())).toBe('png');
    expect(detectImageFormat(await base.clone().webp().toBuffer())).toBe('webp');
  });

  test('текст, SVG, GIF и обрезки не считаются картинкой', () => {
    // Assert
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageFormat(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImageFormat(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageFormat(Buffer.from('RIFF1234AVI '))).toBeNull();
  });
});

describe('обработка фото', () => {
  const processor = new ImageProcessor();

  jest.setTimeout(30_000);

  test('три варианта WebP, без увеличения и без EXIF', async () => {
    // Arrange
    const input = await phoneJpeg();

    // Act
    const variants = await processor.process(input);

    // Assert
    expect(variants.map((variant) => variant.size)).toEqual(IMAGE_VARIANTS.map((variant) => variant.size));
    expect(variants.map((variant) => variant.width)).toEqual([480, 1024, 1920]);

    for (const variant of variants) {
      const metadata = await sharp(variant.buffer).metadata();

      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(variant.buffer.includes(Buffer.from('Secret Model 9'))).toBe(false);
    }
  });

  test('маленькое фото не растягивается', async () => {
    // Arrange
    const input = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();

    // Act
    const variants = await processor.process(input);

    // Assert
    expect(variants.every((variant) => variant.width === 300 && variant.height === 200)).toBe(true);
  });

  test('не-картинка с расширением .jpg — 400', async () => {
    // Act
    const act = processor.process(Buffer.from('#!/bin/sh\necho pwned'));

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  test('сигнатура JPEG с мусором вместо данных — 400, а не 500', async () => {
    // Arrange
    const forged = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512, 0x41)]);

    // Act
    const act = processor.process(forged);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  test('обрезанный файл — 400', async () => {
    // Arrange
    const full = await phoneJpeg();

    // Act
    const act = processor.process(full.subarray(0, Math.floor(full.length / 3)));

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });
});

describe('имена и ключи файлов', () => {
  test('ключ генерирует сервер: ГГГГ/ММ/uuid', () => {
    // Act
    const key = newStorageKey(new Date('2026-10-08T10:00:00Z'));

    // Assert
    expect(key).toMatch(/^2026\/10\/[0-9a-f-]{36}$/);
  });

  test('имя файла очищается от пути и управляющих символов', () => {
    // Assert
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalName('C:\\Users\\photo\u0000.jpg')).toBe('photo.jpg');
    expect(sanitizeOriginalName('Фундамент июнь.jpg')).toBe('Фундамент июнь.jpg');
    expect(sanitizeOriginalName('   ')).toBeNull();
  });
});
