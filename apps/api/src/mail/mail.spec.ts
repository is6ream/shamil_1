import { LogMailSender, maskEmail } from './log-mail.sender';
import {
  chargeFailedMail,
  chargeSucceededMail,
  formatRubles,
  loginCodeMail,
  subscriptionStartedMail,
  subscriptionStoppedMail,
} from './mail-templates';

const TZ = 'Asia/Yekaterinburg';
const CANCEL_URL = 'https://mechetshamil.ru/cabinet/cancel?token=abc';

describe('шаблоны писем', () => {
  test('суммы — рубли с неразрывными пробелами, копейки только если они есть', () => {
    expect(formatRubles(150_000n)).toBe('1\u00a0500\u00a0₽');
    expect(formatRubles(10_050n)).toBe('100,50\u00a0₽');
  });

  test('код входа есть и в теме, и в тексте', () => {
    // Act
    const mail = loginCodeMail('donor@example.test', '123456', 10);

    // Assert
    expect(mail.subject).toContain('123456');
    expect(mail.text).toContain('123456');
    expect(mail.text).toContain('10 минут');
  });

  test('в каждом письме о действующей подписке есть ссылка на отмену', () => {
    // Arrange
    const base = { to: 'donor@example.test', amountKopecks: 50_000n, timeZone: TZ, cancelUrl: CANCEL_URL };
    const at = new Date('2026-11-15T07:00:00Z');

    // Act
    const mails = [
      subscriptionStartedMail({ ...base, nextChargeAt: at }),
      chargeSucceededMail({ ...base, paidAt: at, nextChargeAt: at }),
      chargeFailedMail({ ...base, retryAt: at, reason: null }),
    ];

    // Assert
    for (const mail of mails) {
      expect(mail.text).toContain(CANCEL_URL);
      expect(mail.html).toContain(CANCEL_URL);
    }
  });

  test('слово «вклад» не используется ни в одном письме', () => {
    // Arrange
    const base = { to: 'd@example.test', amountKopecks: 50_000n, timeZone: TZ, cancelUrl: CANCEL_URL };
    const at = new Date();

    // Act
    const texts = [
      loginCodeMail('d@example.test', '000000', 10),
      subscriptionStartedMail({ ...base, nextChargeAt: at }),
      chargeSucceededMail({ ...base, paidAt: at, nextChargeAt: at }),
      chargeFailedMail({ ...base, retryAt: at, reason: 'Недостаточно средств' }),
      subscriptionStoppedMail({ ...base, reason: 'failed', cabinetUrl: 'https://x.test/cabinet' }),
      subscriptionStoppedMail({ ...base, reason: 'cancelled', cabinetUrl: 'https://x.test/cabinet' }),
    ].map((mail) => `${mail.subject} ${mail.text}`);

    // Assert
    for (const text of texts) {
      expect(text.toLowerCase()).not.toMatch(/вклад/);
    }
  });

  test('причина отказа экранируется в HTML', () => {
    // Act
    const mail = chargeFailedMail({
      to: 'd@example.test',
      amountKopecks: 10_000n,
      timeZone: TZ,
      cancelUrl: CANCEL_URL,
      retryAt: new Date(),
      reason: '<script>alert(1)</script>',
    });

    // Assert
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});

describe('лог-отправитель', () => {
  test('копит письма для проверки и маскирует адрес', async () => {
    // Arrange
    const sender = new LogMailSender(false);

    // Act
    await sender.send(loginCodeMail('ivan@example.test', '654321', 10));

    // Assert
    expect(sender.outbox()).toHaveLength(1);
    expect(sender.outbox()[0]?.text).toContain('654321');
    expect(maskEmail('ivan@example.test')).toBe('iv***@example.test');
  });
});
