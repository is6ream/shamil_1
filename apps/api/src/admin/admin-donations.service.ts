import { BadRequestException, Injectable } from '@nestjs/common';

import { KOPECKS_IN_RUBLE, MAX_MANUAL_CONFIRM_KOPECKS } from '../config/constants';
import { PaymentsService } from '../payments/payments.service';
import type { ManualConfirmation } from '../payments/payments.types';
import type { ConfirmDonationDto } from './dto/confirm-donation.dto';
import type { ConfirmedDonationResponse } from './dto/admin-donation-response.dto';

/**
 * Граница админского HTTP-API: разбор тела запроса и сборка ответа.
 *
 * Сам перевод `pending → paid` живёт в `PaymentsService` — там же, где его
 * делает вебхук. Дублировать здесь транзакцию, ключ идемпотентности и переход
 * статуса значило бы завести второй путь записи в `donation`, который однажды
 * разойдётся с первым.
 */
@Injectable()
export class AdminDonationsService {
  constructor(private readonly payments: PaymentsService) {}

  async confirm(donationId: string, dto: ConfirmDonationDto): Promise<ConfirmedDonationResponse> {
    const confirmation = await this.payments.confirmManual(donationId, {
      amountKopecks: this.parseAmount(dto.amountKopecks),
      method: dto.method,
    });

    return toResponse(confirmation);
  }

  /**
   * Сумма из тела запроса в копейки.
   *
   * Формат уже проверен DTO — здесь остаётся верхняя граница. Она нужна не
   * против щедрости: лишний ноль в админской форме уедет прямо в витринные
   * счётчики, а вынуть его оттуда можно будет только правкой оплаченного
   * доната, которую триггер пересчёта разбирает отдельной веткой.
   */
  private parseAmount(raw?: string): bigint | undefined {
    if (raw === undefined) {
      return undefined;
    }

    const amountKopecks = BigInt(raw);

    if (amountKopecks > MAX_MANUAL_CONFIRM_KOPECKS) {
      throw new BadRequestException(
        `Сумма подтверждения не может превышать ${MAX_MANUAL_CONFIRM_KOPECKS / BigInt(KOPECKS_IN_RUBLE)} ₽`,
      );
    }

    return amountKopecks;
  }
}

function toResponse(confirmation: ManualConfirmation): ConfirmedDonationResponse {
  return {
    orderId: confirmation.orderId,
    status: confirmation.status,
    paidAmountKopecks: confirmation.paidAmountKopecks?.toString() ?? null,
    paidAt: confirmation.paidAt?.toISOString() ?? null,
    applied: confirmation.applied,
  };
}
