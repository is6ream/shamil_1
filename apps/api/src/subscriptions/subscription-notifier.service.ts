import { Inject, Injectable } from '@nestjs/common';

import {
  chargeFailedMail,
  chargeSucceededMail,
  subscriptionStartedMail,
  subscriptionStoppedMail,
} from '../mail/mail-templates';
import type { StopReason } from '../mail/mail-templates';
import { MAIL_SENDER } from '../mail/mail.types';
import type { MailSender } from '../mail/mail.types';
import type { AfterCommit } from '../payments/payments.types';
import { SubscriptionLinksService } from './subscription-links.service';

/** Всё, что письму нужно знать о подписке и её владельце. */
export interface NotifiableSubscription {
  readonly id: string;
  readonly amountKopecks: bigint;
  readonly user: { readonly email: string; readonly timezone: string };
}

/**
 * Письма о подписке. Возвращает действия «после коммита», а не шлёт сразу:
 * письмо «списание прошло» не должно уйти, если транзакция откатится.
 */
@Injectable()
export class SubscriptionNotifier {
  constructor(
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly links: SubscriptionLinksService,
  ) {}

  started(subscription: NotifiableSubscription, nextChargeAt: Date): AfterCommit {
    return () => this.mail.send(subscriptionStartedMail({ ...this.base(subscription), nextChargeAt }));
  }

  chargeSucceeded(subscription: NotifiableSubscription, paidAt: Date, nextChargeAt: Date): AfterCommit {
    return () => this.mail.send(chargeSucceededMail({ ...this.base(subscription), paidAt, nextChargeAt }));
  }

  chargeFailed(subscription: NotifiableSubscription, retryAt: Date, reason: string | null): AfterCommit {
    return () => this.mail.send(chargeFailedMail({ ...this.base(subscription), retryAt, reason }));
  }

  stopped(subscription: NotifiableSubscription, reason: StopReason): AfterCommit {
    return () =>
      this.mail.send(
        subscriptionStoppedMail({
          to: subscription.user.email,
          amountKopecks: subscription.amountKopecks,
          timeZone: subscription.user.timezone,
          reason,
          cabinetUrl: this.links.cabinetUrl(),
        }),
      );
  }

  private base(subscription: NotifiableSubscription): {
    to: string;
    amountKopecks: bigint;
    timeZone: string;
    cancelUrl: string;
  } {
    return {
      to: subscription.user.email,
      amountKopecks: subscription.amountKopecks,
      timeZone: subscription.user.timezone,
      cancelUrl: this.links.cancelUrl(subscription.id),
    };
  }
}
