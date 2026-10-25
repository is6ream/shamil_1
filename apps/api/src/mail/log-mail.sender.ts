import { Logger } from '@nestjs/common';

import type { MailMessage, MailSender } from './mail.types';

/** Сколько последних писем держит в памяти лог-отправитель — для e2e и ручной проверки. */
const OUTBOX_LIMIT = 50;

/** `ivan@example.com` → `iv***@example.com`: в логе видно, кому, но не весь адрес. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');

  return at <= 0 ? '***' : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/**
 * Письма в лог вместо почты — для разработки и тестов.
 *
 * Тело пишется в лог только вне production: в нём код входа и ссылка отмены,
 * а логи хостинга читают не только владельцы сайта. В production этот
 * транспорт при включённом кабинете запрещён валидацией окружения.
 */
export class LogMailSender implements MailSender {
  private readonly logger = new Logger('Mail');
  private readonly sent: MailMessage[] = [];

  constructor(private readonly printBody: boolean) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);

    if (this.sent.length > OUTBOX_LIMIT) {
      this.sent.shift();
    }

    const head = `[${message.kind}] → ${maskEmail(message.to)}: ${message.subject}`;

    this.logger.log(this.printBody ? `${head}\n${message.text}` : head);
  }

  /** Отправленные письма, новые в конце. Копия — снаружи список не изменить. */
  outbox(): readonly MailMessage[] {
    return [...this.sent];
  }
}
