import { BadRequestException } from '@nestjs/common';

/**
 * Деньги в API — строкой из цифр, в копейках: BigInt в JSON не сериализуется,
 * а через `number` копейки сбора уже теряют точность. Тот же формат, что
 * у `ConfirmDonationDto.amountKopecks`.
 */
export const KOPECKS_STRING_PATTERN = /^(0|[1-9][0-9]{0,13})$/;

export const KOPECKS_STRING_MESSAGE = 'сумма — целое число копеек строкой из цифр, без пробелов и знаков';

export function parseKopecks(value: string, max: bigint, field: string): bigint {
  const kopecks = BigInt(value);

  if (kopecks > max) {
    throw new BadRequestException(`${field}: не больше ${max} копеек`);
  }

  return kopecks;
}

export function kopecksToString(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}
