import { Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';

import type { MailConfig } from '../config/configuration';
import { maskEmail } from './log-mail.sender';
import type { MailMessage, MailSender } from './mail.types';

/** Таймауты SMTP: зависший сервер почты не должен держать запрос кода входа минутами. */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Почта домена mechetshamil.ru на REG.RU через SMTP. Пул соединений не нужен:
 * писем — единицы в минуту (коды входа и уведомления о списаниях).
 */
export class SmtpMailSender implements MailSender, OnModuleDestroy {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;

  constructor(private readonly config: MailConfig) {
    if (config.smtp === undefined) {
      throw new Error('SmtpMailSender: не задан SMTP_HOST');
    }

    this.transporter = createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    this.logger.log(`[${message.kind}] отправлено → ${maskEmail(message.to)}`);
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
