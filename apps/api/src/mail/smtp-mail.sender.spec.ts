import { SmtpMailSender } from './smtp-mail.sender';
import type { DonorSmtpFactory } from './smtp-mail.sender';

describe('Donor SMTP adapter with injected test transport only', () => {
  const options = { host: 'smtp.example.test', port: 587, secure: false, user: 'synthetic', pass: 'synthetic', from: 'sender@example.test' };
  it('requires verified TLS, disables debug/file/url access and delivers only to the supplied transport', async () => {
    const transport = { sendMail: jest.fn().mockResolvedValue({}), close: jest.fn() };
    const factory = jest.fn<ReturnType<DonorSmtpFactory>, Parameters<DonorSmtpFactory>>(() => transport);
    const sender = new SmtpMailSender(options, factory);
    await sender.sendCode({ to: 'donor@example.test', code: '004210', expiresInSeconds: 600 });
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({
      requireTLS: true, logger: false, debug: false, connectionTimeout: 10_000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    }));
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: options.from, to: 'donor@example.test', text: expect.stringContaining('004210'), disableFileAccess: true, disableUrlAccess: true,
    }));
    sender.onModuleDestroy();
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  it('rejects incomplete or header-injecting configuration without leaking values', () => {
    const factory = jest.fn();
    expect(() => new SmtpMailSender({ ...options, from: 'secret\r\nBcc: other@example.test' }, factory)).toThrow('Donor SMTP configuration is incomplete');
    expect(factory).not.toHaveBeenCalled();
  });
});
