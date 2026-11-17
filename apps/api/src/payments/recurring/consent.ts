import type { Donation, RecurringSubscription } from '../../generated/prisma/client';
import { frequencies } from './calendar';
import { RECURRING_TERMS_ARCHIVE } from './terms';

/** A historical row, claim, or version string alone is never evidence of acceptance. */
export function hasConsentEvidence(sub: RecurringSubscription, order: Donation, archive = RECURRING_TERMS_ARCHIVE): boolean {
  if (!sub.ownerId || !sub.consentVerifiedAt || !sub.termsSnapshot || !Number.isFinite(+sub.consentedAt)
    || !Number.isFinite(+sub.consentVerifiedAt)
    || +sub.consentVerifiedAt < +sub.consentedAt || +sub.consentVerifiedAt > Date.now()
    || !frequencies.includes(sub.frequency as typeof frequencies[number])) return false;
  const text = archive[sub.termsVersion]?.join('\n\n');
  if (!text) return false;
  try {
    const snapshot: unknown = JSON.parse(sub.termsSnapshot);
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    const evidence = snapshot as Record<string, unknown>;
    return evidence.version === sub.termsVersion && evidence.text === text
      && evidence.amountKopecks === order.amountKopecks.toString()
      && evidence.frequency === sub.frequency && evidence.previewDate === sub.previewDate
      && /^\d{4}-\d{2}-\d{2}$/.test(sub.previewDate)
      && new Date(sub.previewDate + 'T00:00:00Z').toISOString().slice(0, 10) === sub.previewDate;
  } catch {
    return false;
  }
}
