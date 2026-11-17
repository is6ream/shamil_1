import type { PaymentConfig } from '../../config/configuration';
import type { Donation, RecurringSubscription } from '../../generated/prisma/client';
import type { RecurringOptions } from '../../recurring-contract/contract';
import { queryRecurring, sendRecurring } from './robokassa-recurring';

export const RECURRING_TRANSPORT = Symbol('RECURRING_TRANSPORT');
export const RECURRING_TERMS_SOURCE = Symbol('RECURRING_TERMS_SOURCE');
export const RECURRING_EVIDENCE_POLICY = Symbol('RECURRING_EVIDENCE_POLICY');
export type TermsSource = Readonly<Record<string, readonly string[]>>;
export interface RecurringTransport {
  query: typeof queryRecurring;
  send: typeof sendRecurring;
}
export const robokassaTransport: RecurringTransport = { query: queryRecurring, send: sendRecurring };
export interface EvidencePolicy {
  verified(sub: RecurringSubscription & { firstDonation: Donation }, payment: PaymentConfig, options?: RecurringOptions): boolean;
}
/** Evidence of our signed request + documented card settlement + separately recorded merchant approval.
 * No undocumented provider eligibility flag, and no test-mode bypass.
 */
export const documentedEvidencePolicy: EvidencePolicy = {
  verified(sub, payment, options) {
    if (!options?.approvalReference || !sub.providerEvidence || !sub.settlementEvidence || payment.isTest || payment.emulatorEnabled) return false;
    try {
      const evidence = JSON.parse(sub.providerEvidence) as Record<string, unknown>;
      const settlement = JSON.parse(sub.settlementEvidence) as Record<string, unknown>;
      return evidence.recurring === true && evidence.merchantId === payment.merchantId
        && settlement.source === 'OpStateExt' && settlement.method === options.cardMethodCode
        && settlement.orderId === sub.firstDonationId && settlement.currency === 'RUB'
        && settlement.invoiceNo === sub.firstDonation.invoiceNo
        && evidence.mode === 'live' && evidence.orderId === sub.firstDonationId
        && evidence.invoiceNo === sub.firstDonation.invoiceNo && evidence.currency === 'RUB'
        && evidence.cardLabel === options.cardLabel && evidence.cardMethodCode === options.cardMethodCode
        && evidence.approvalReference === options.approvalReference
        && sub.firstDonation.status === 'paid'
        && sub.firstDonation.paidAmountKopecks === sub.firstDonation.amountKopecks;
    } catch { return false; }
  },
};
