import { MANUAL_PROVIDER_CODE } from '../../config/constants';
import { RecurringEmulatorOutcome } from '../../config/env.validation';
import type { ChargeState, RecurringChargeInput, RecurringGateway, RecurringSubmitResult } from './recurring-gateway';

/** Текст отказа имитации — чтобы в письме и кабинете было видно, что это не банк. */
export const SIMULATED_DECLINE_REASON = 'Имитация отказа (RECURRING_EMULATOR_OUTCOME=declined)';

/**
 * Имитация автосписаний для `PAYMENT_PROVIDER=manual` вне production:
 * весь цикл подписки проверяется локально без Robokassa и без эмулятора.
 * Денег нет и быть не может — поэтому фабрика не создаёт её в production.
 *
 * Исход задаёт `RECURRING_EMULATOR_OUTCOME`; сверка статуса — сразу, ждать нечего.
 */
export class SimulatedRecurringGateway implements RecurringGateway {
  readonly providerCode = MANUAL_PROVIDER_CODE;
  readonly reconcileDelayMs = 0;

  private readonly submitted = new Map<number, bigint>();

  constructor(private readonly outcome: RecurringEmulatorOutcome) {}

  async submit(input: RecurringChargeInput): Promise<RecurringSubmitResult> {
    this.submitted.set(input.invoiceNo, input.amountKopecks);

    return { accepted: true };
  }

  async checkState(invoiceNo: number): Promise<ChargeState> {
    const amount = this.submitted.get(invoiceNo);

    if (amount === undefined) {
      return { kind: 'not_found' };
    }

    return this.outcome === RecurringEmulatorOutcome.Paid
      ? { kind: 'paid', amountKopecks: amount }
      : { kind: 'failed', reason: SIMULATED_DECLINE_REASON };
  }
}
