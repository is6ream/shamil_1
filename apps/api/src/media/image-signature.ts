/**
 * Тип изображения по первым байтам файла. Ни расширению, ни заголовку
 * `Content-Type` из multipart не верим — их задаёт клиент.
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp';

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** RIFF....WEBP: размер чанка между ними произвольный. */
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_TAG_OFFSET = 8;

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) {
    return false;
  }

  return signature.every((byte, index) => buffer[offset + index] === byte);
}

export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (startsWith(buffer, JPEG)) {
    return 'jpeg';
  }

  if (startsWith(buffer, PNG)) {
    return 'png';
  }

  if (startsWith(buffer, RIFF) && startsWith(buffer, WEBP, WEBP_TAG_OFFSET)) {
    return 'webp';
  }

  return null;
}
