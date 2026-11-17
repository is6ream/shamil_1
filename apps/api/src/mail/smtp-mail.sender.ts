import type { OnModuleDestroy } from '@nestjs/common';
import type { DonorMailSender } from '../recurring-contract/contract';

export interface DonorSmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
  readonly pass: string;
  readonly from: string;
}
/** Integrator injects nodemailer.createTransport; dependency/config wiring belongs to 01. */
export interface DonorSmtpTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string; disableFileAccess: true; disableUrlAccess: true }): Promise<unknown>;
  close(): void;
}
export type DonorSmtpFactory = (options: {
  host: string; port: number; secure: boolean; requireTLS: true;
  auth: { user: string; pass: string };
  connectionTimeout: number; greetingTimeout: number; socketTimeout: number;
  tls: { rejectUnauthorized: true; minVersion: 'TLSv1.2' };
  logger: false; debug: false;
}) => DonorSmtpTransport;

export class SmtpMailSender implements DonorMailSender, OnModuleDestroy {
  private readonly transport: DonorSmtpTransport;

  constructor(private readonly options: DonorSmtpOptions, factory: DonorSmtpFactory) {
    if (!options.host || !options.user || !options.pass || !options.from || /[\r\n]/.test(options.from)
      || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
      throw new Error('Donor SMTP configuration is incomplete');
    }
    this.transport = factory({
      host: options.host, port: options.port, secure: options.secure, requireTLS: true,
      auth: { user: options.user, pass: options.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, logger: false, debug: false,
    });
  }

  async sendCode(message: { to: string; code: string; expiresInSeconds: 600 }): Promise<void> {
    await this.transport.sendMail({
      from: this.options.from, to: message.to, subject: 'Код входа — Мечеть Шамиль',
      text: `Код входа: ${message.code}\nКод действует 10 минут. Не сообщайте его другим людям.\nЕсли вы не запрашивали код, проигнорируйте это письмо.`,
      disableFileAccess: true, disableUrlAccess: true,
    });
  }

  onModuleDestroy(): void { this.transport.close(); }
}
