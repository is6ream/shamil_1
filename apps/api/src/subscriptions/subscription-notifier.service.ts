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
  /** Пусто у обезличенного аккаунта: писать некому, письмо не уходит. */
  readonly user: { readonly email: string | null; readonly timezone: string };
}

const NOTHING_TO_SEND: AfterCommit = () => Promise.resolve();

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
    const base = this.base(subscription);

    return base === null ? NOTHING_TO_SEND : () => this.mail.send(subscriptionStartedMail({ ...base, nextChargeAt }));
  }

  chargeSucceeded(subscription: NotifiableSubscription, paidAt: Date, nextChargeAt: Date): AfterCommit {
    const base = this.base(subscription);

    return base === null
      ? NOTHING_TO_SEND
      : () => this.mail.send(chargeSucceededMail({ ...base, paidAt, nextChargeAt }));
  }

  chargeFailed(subscription: NotifiableSubscription, retryAt: Date, reason: string | null): AfterCommit {
    const base = this.base(subscription);

    return base === null ? NOTHING_TO_SEND : () => this.mail.send(chargeFailedMail({ ...base, retryAt, reason }));
  }

  stopped(subscription: NotifiableSubscription, reason: StopReason): AfterCommit {
    const to = subscription.user.email;

    if (to === null) {
      return NOTHING_TO_SEND;
    }

    return () =>
      this.mail.send(
        subscriptionStoppedMail({
          to,
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
  } | null {
    if (subscription.user.email === null) {
      return null;
    }

    return {
      to: subscription.user.email,
      amountKopecks: subscription.amountKopecks,
      timeZone: subscription.user.timezone,
      cancelUrl: this.links.cancelUrl(subscription.id),
    };
  }
}
