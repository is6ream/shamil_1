import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../audit/audit.service';
import type { AppConfig } from '../../config/configuration';
import { RecurringEmulatorOutcome } from '../../config/env.validation';
import type { PrismaService } from '../../database/prisma.service';
import { LogMailSender } from '../../mail/log-mail.sender';
import { PaymentProviderResolver } from '../../payments/payment-provider.resolver';
import { PaymentsService } from '../../payments/payments.service';
import { ManualProvider } from '../../payments/providers/manual.provider';
import { SimulatedRecurringGateway } from '../../payments/recurring/simulated-recurring.gateway';
import { SubscriptionLifecycleService } from '../subscription-lifecycle.service';
import { SubscriptionLinksService } from '../subscription-links.service';
import { SubscriptionNotifier } from '../subscription-notifier.service';
import { SubscriptionsService } from '../subscriptions.service';

export const HARNESS_SITE_URL = 'https://mechetshamil.test';

/**
 * Сервисы подписок, собранные руками поверх тестовой БД: ручной провайдер
 * и имитация автосписаний — тот же путь, что `PAYMENT_PROVIDER=manual` локально.
 */
export interface SubscriptionHarness {
  readonly config: ConfigService<AppConfig, true>;
  readonly mail: LogMailSender;
  readonly payments: PaymentsService;
  readonly gateway: SimulatedRecurringGateway;
  readonly links: SubscriptionLinksService;
  readonly notifier: SubscriptionNotifier;
  readonly subscriptions: SubscriptionsService;
}

export function createSubscriptionHarness(
  prisma: PrismaService,
  outcome: RecurringEmulatorOutcome = RecurringEmulatorOutcome.Paid,
): SubscriptionHarness {
  const config = new ConfigService<AppConfig, true>({
    donor: { enabled: true, jwtSecret: 'j'.repeat(48), hmacSecret: 'h'.repeat(48), cookieSecure: false },
    publicUrls: { apiUrl: 'https://api.mechetshamil.test', siteUrl: HARNESS_SITE_URL },
    isProduction: false,
  });
  const mail = new LogMailSender(false);
  const payments = new PaymentsService(prisma, new AuditService(prisma));
  const gateway = new SimulatedRecurringGateway(outcome);
  const links = new SubscriptionLinksService(config);
  const notifier = new SubscriptionNotifier(mail, links);
  const resolver = new PaymentProviderResolver({
    manual: new ManualProvider(config),
    online: null,
    defaultChannel: 'transfer',
  });

  new SubscriptionLifecycleService(payments, notifier).onModuleInit();

  return {
    config,
    mail,
    payments,
    gateway,
    links,
    notifier,
    subscriptions: new SubscriptionsService(prisma, resolver, gateway, notifier),
  };
}
