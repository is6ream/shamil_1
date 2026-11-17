import type { AttributionDto } from '../attribution/dto/attribution.dto';

/**
 * Foundation contract v1. See docs/recurring-implementation/CONTRACT.md.
 * These are wire types, not runtime validation or proof of identity.
 */
export const RECURRING_CONTRACT_VERSION = 1 as const;
export const DONOR_IDENTITY = Symbol('DONOR_IDENTITY');

export interface VerifiedDonorIdentity {
  readonly donorId: string;
  readonly sessionId: string;
  readonly emailVerifiedAt: Date;
}
/** Implemented/exported by DonorAuthModule (02), injected by recurring management (03). */
export interface DonorIdentityResolver {
  requireSession(rawToken: string): Promise<VerifiedDonorIdentity>;
}

export type RecurringFrequency = 'daily' | 'every_friday' | 'monthly';
export type SubscriptionState = 'pending' | 'active' | 'cancelled' | 'failed' | 'review';
export type AttemptState = 'reserved' | 'accepted' | 'unknown' | 'failed' | 'paid' | 'skipped' | 'review';
export type DonationState = 'pending' | 'paid' | 'failed';
export interface RequestEmailCodeBody { email: string }
export interface VerifyEmailCodeBody { challengeId: string; code: string }
export interface EmailCodeRequested { accepted: true; challengeId: string; expiresInSeconds: 600; retryAfterSeconds: 60 }
export interface DonorSessionView {
  donor: { id: string; email: string; emailVerifiedAt: string };
  expiresAt: string;
}
/** API-to-server-BFF only; BFF strips sessionToken before returning JSON to browser. */
export interface VerifiedEmailSession extends DonorSessionView { sessionToken: string }
export interface RecurringCheckoutBody {
  amountKopecks: number;
  frequency: RecurringFrequency;
  method: 'card';
  accepted: true;
  version: string;
  previewDate: string;
  isAnonymous?: boolean;
  donorName?: string;
  // Optional attribution has the existing AttributionDto shape; validate it server-side.
  attribution?: AttributionDto;
}
export interface RecurringCheckoutResponse { subscriptionId: string; orderId: string; redirectUrl: string }
export interface RecurringCapabilities {
  online: boolean;
  recurring: null | {
    version: string; termsUrl: string; cancellationUrl: string;
    minKopecks: string; maxKopecks: string;
    timezone: 'Europe/Moscow'; chargeLocalTime: '10:00'; requiresVerifiedEmail: true;
    dates: Record<RecurringFrequency, string>;
  };
}
export interface SubscriptionView {
  id: string; amountKopecks: string; frequency: RecurringFrequency; state: SubscriptionState;
  termsVersion: string; consentedAt: string; consentVerified: boolean;
  nextAt: string | null; createdAt: string; cancelledAt: string | null;
  firstPayment: DonationState;
  latestAttempt: { period: string; state: AttemptState } | null;
}
export interface HistoryItem {
  orderId: string; kind: 'first' | 'repeat'; period: string | null; scheduledAt: string | null;
  status: DonationState; operationState: AttemptState | null;
  amountKopecks: string; paidAmountKopecks: string | null; paidAt: string | null;
}
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface ClaimLegacyBody { legacyKey: string }
export interface ClaimLegacyResponse { subscription: SubscriptionView; claimed: boolean }
export type RecurringErrorCode =
  | 'VALIDATION_ERROR' | 'ORIGIN_FORBIDDEN' | 'AUTH_REQUIRED' | 'EMAIL_CODE_INVALID' | 'RATE_LIMITED'
  | 'EMAIL_UNAVAILABLE' | 'RECURRING_UNAVAILABLE' | 'CONSENT_STALE'
  | 'IDEMPOTENCY_CONFLICT' | 'NOT_FOUND' | 'LEGACY_ALREADY_CLAIMED' | 'SERVICE_UNAVAILABLE';
export interface RecurringError {
  error: { code: RecurringErrorCode; message: string; retryAfterSeconds?: number };
}

/** Supplied by integrator's module factories from validated configuration, never process.env in agents. */
export const DONOR_AUTH_OPTIONS = Symbol('DONOR_AUTH_OPTIONS');
export const DONOR_MAIL = Symbol('DONOR_MAIL');
export const RECURRING_OPTIONS = Symbol('RECURRING_OPTIONS');
export interface DonorAuthOptions {
  readonly codeHmacSecret: string;
  readonly sessionTtlMs: number;
}
export interface DonorMailSender {
  sendCode(message: { to: string; code: string; expiresInSeconds: 600 }): Promise<void>;
}
export interface RecurringOptions {
  readonly approvalReference?: string | null;
  readonly checkoutEnabled: boolean;
  readonly dispatchEnabled: boolean;
  /** Null until an approved email-access edition exists; never rewrite the legacy archive. */
  readonly termsVersion: string | null;
  readonly termsUrl: string | null;
  readonly cancellationUrl: string | null;
  readonly cardLabel: string | null;
  readonly cardMethodCode: string | null;
  readonly maxKopecks: bigint | null;
}
