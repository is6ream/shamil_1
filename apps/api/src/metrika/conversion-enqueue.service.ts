import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import type { Prisma } from '../generated/prisma/client';
import { MetrikaConversionStatus } from '../generated/prisma/enums';
import { CONVERSION_CURRENCY, SKIP_REASONS } from './metrika.constants';

/** Поля оплаченного доната, которые уходят в строку outbox. */
interface PaidDonationIdentity {
  ymClientId: string | null;
  yclid: string | null;
  paidAmountKopecks: bigint;
  paidAt: Date;
}

/**
 * Постановка оплаты в очередь офлайн-конверсий.
 *
 * Вызывается внутри транзакции перехода доната в `paid` — той же, что пишет
 * статус. Откатится оплата — откатится и строка outbox; закоммитится —
 * планировщик точно её увидит. Отдельного «после коммита» здесь нет намеренно:
 * его пропуск при падении процесса терял бы конверсии без следа.
 *
 * Строка создаётся и без идентификатора визита — сразу `SKIPPED`: по таблице
 * видно, какая доля оплат не дошла до Метрики и почему.
 */
@Injectable()
export class ConversionEnqueueService {
  private readonly logger = new Logger(ConversionEnqueueService.name);
  private readonly target: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.target = config.get('metrika', { infer: true }).offlineGoal;
  }

  async enqueue(tx: Prisma.TransactionClient, donationId: string): Promise<void> {
    await tx.$executeRaw`SAVEPOINT metrika_enqueue`;
    try {
      const donation = await tx.donation.findUniqueOrThrow({
        where: { id: donationId },
        select: { ymClientId: true, yclid: true, paidAmountKopecks: true, paidAt: true },
      });

      if (donation.paidAmountKopecks === null || donation.paidAt === null) {
        throw new Error('Неоплаченный донат не может попасть в очередь Метрики');
      }

      const hasIdentifier = donation.ymClientId !== null || donation.yclid !== null;

      await this.insert(
        tx,
        donationId,
        {
          ymClientId: donation.ymClientId,
          yclid: donation.yclid,
          paidAmountKopecks: donation.paidAmountKopecks,
          paidAt: donation.paidAt,
        },
        hasIdentifier,
      );
      await tx.$executeRaw`RELEASE SAVEPOINT metrika_enqueue`;
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT metrika_enqueue`;
      await tx.$executeRaw`RELEASE SAVEPOINT metrika_enqueue`;

      // Prisma error text can include the complete insert and visit identifiers.
      this.logger.error(`Офлайн-конверсия доната ${donationId} не записана, оплата проходит без неё`);
    }
  }

  private async insert(
    tx: Prisma.TransactionClient,
    donationId: string,
    donation: PaidDonationIdentity,
    hasIdentifier: boolean,
  ): Promise<void> {
    // createMany + skipDuplicates — это ON CONFLICT DO NOTHING: повторная
    // постановка того же доната не роняет транзакцию оплаты.
    const { count } = await tx.metrikaOfflineConversion.createMany({
      data: {
        donationId,
        target: this.target,
        clientId: donation.ymClientId,
        yclid: donation.yclid,
        amountKopecks: donation.paidAmountKopecks,
        currency: CONVERSION_CURRENCY,
        conversionAt: donation.paidAt,
        status: hasIdentifier ? MetrikaConversionStatus.PENDING : MetrikaConversionStatus.SKIPPED,
        skipReason: hasIdentifier ? null : SKIP_REASONS.noIdentifier,
      },
      skipDuplicates: true,
    });

    if (count === 1) {
      this.logger.log(
        `Офлайн-конверсия доната ${donationId}: ${hasIdentifier ? 'в очереди' : `пропуск (${SKIP_REASONS.noIdentifier})`}`,
      );
    }
  }
}
