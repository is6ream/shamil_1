/** Письмо, готовое к отправке. Шаблоны собирают его целиком — отправитель ничего не дописывает. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Что за письмо — для лога без содержимого: `login_code`, `charge_failed`. */
  readonly kind: string;
}

/**
 * Отправка писем. Две реализации: SMTP почты домена (REG.RU) и лог —
 * для разработки и тестов. Сервисы зависят от интерфейса, а не от nodemailer.
 */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/** DI-токен `MailSender`. */
export const MAIL_SENDER = Symbol('MAIL_SENDER');
