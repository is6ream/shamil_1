import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { MANUAL_CONFIRM_METHODS } from '../../config/constants';
import type { ManualConfirmMethod } from '../../config/constants';

/**
 * Сумма в копейках строкой из одних цифр, без ведущего нуля.
 *
 * Строка, а не число: деньги в этом проекте — BigInt, и единственный способ
 * не пропустить их через double по дороге — не отдавать их `JSON.parse`
 * как число вовсе. 12 знаков с запасом перекрывают потолок
 * `MAX_MANUAL_CONFIRM_KOPECKS`, который проверяется отдельно — здесь только
 * формат, диапазон валидатором на строке не выразить.
 */
const KOPECKS_PATTERN = /^[1-9][0-9]{0,11}$/;

/**
 * Тело админского подтверждения ручного перевода.
 *
 * Оба поля необязательны: обычный случай — «деньги пришли ровно на сумму
 * заказа переводом по реквизитам», и он не требует тела вообще.
 */
export class ConfirmDonationDto {
  /**
   * Фактически поступившая сумма в копейках, если она разошлась с заказом:
   * донатер округлил, банк удержал комиссию, перевели чуть больше.
   * Не передана — зачисляется сумма заказа.
   */
  @IsOptional()
  @IsString()
  @Matches(KOPECKS_PATTERN, {
    message: 'amountKopecks — положительное целое число копеек строкой, без пробелов и знаков',
  })
  amountKopecks?: string;

  /** Как пришли деньги. По умолчанию — перевод по реквизитам. */
  @IsOptional()
  @IsIn(MANUAL_CONFIRM_METHODS)
  method?: ManualConfirmMethod;
}
