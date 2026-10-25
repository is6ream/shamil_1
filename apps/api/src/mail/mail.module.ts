import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { MailTransport } from '../config/env.validation';
import { LogMailSender } from './log-mail.sender';
import { MAIL_SENDER } from './mail.types';
import type { MailSender } from './mail.types';
import { SmtpMailSender } from './smtp-mail.sender';

export function createMailSender(config: ConfigService<AppConfig, true>): MailSender {
  const mail = config.get('mail', { infer: true });

  switch (mail.transport) {
    case MailTransport.Smtp:
      return new SmtpMailSender(mail);

    case MailTransport.Log:
      return new LogMailSender(!config.get('isProduction', { infer: true }));
  }
}

/** Отправка писем. Глобальный: письма шлют кабинет, подписки и планировщик. */
@Global()
@Module({
  providers: [{ provide: MAIL_SENDER, inject: [ConfigService], useFactory: createMailSender }],
  exports: [MAIL_SENDER],
})
export class MailModule {}
