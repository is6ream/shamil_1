import { KOPECKS_IN_RUBLE } from '../config/constants';
import type { MailMessage } from './mail.types';

/**
 * Тексты писем кабинета. Тон — как у сайта: тёплый, без канцелярита
 * (CLAUDE.md, «Вдохновлять, а не обязывать»). Слово «вклад» не используем.
 *
 * Каждое письмо о подписке несёт ссылку на отмену: отказаться от автосписаний
 * должно быть так же просто, как оформить их, — и без входа в кабинет.
 * Хадисы сюда не вставляем: без выверки имамом их не публикуем нигде.
 */

/** Неразрывный пробел: «1 500 ₽» не должно переноситься посередине. */
const NBSP = String.fromCharCode(0xa0);

const SIGNATURE = 'Мечеть «Шамиль», Уфа · mechetshamil.ru';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 150000 коп. → «1 500 ₽», 10050 → «100,50 ₽». */
export function formatRubles(amountKopecks: bigint): string {
  const base = BigInt(KOPECKS_IN_RUBLE);
  const rubles = (amountKopecks / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const kopecks = amountKopecks % base;

  return kopecks === 0n ? `${rubles}${NBSP}₽` : `${rubles},${kopecks.toString().padStart(2, '0')}${NBSP}₽`;
}

export function formatDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(value);
}

interface Paragraph {
  readonly text: string;
  readonly link?: { readonly label: string; readonly url: string };
}

function compose(to: string, kind: string, subject: string, paragraphs: readonly Paragraph[]): MailMessage {
  const text = [
    ...paragraphs.map((p) => (p.link === undefined ? p.text : `${p.text}\n${p.link.label}: ${p.link.url}`)),
    `—\n${SIGNATURE}`,
  ].join('\n\n');
  const html = [
    ...paragraphs.map((p) => {
      const link =
        p.link === undefined
          ? ''
          : ` <a href="${escapeHtml(p.link.url)}">${escapeHtml(p.link.label)}</a>`;

      return `<p>${escapeHtml(p.text)}${link}</p>`;
    }),
    `<p style="color:#667">${escapeHtml(SIGNATURE)}</p>`,
  ].join('\n');

  return { to, kind, subject, text, html };
}

function cancelParagraph(cancelUrl: string): Paragraph {
  return {
    text: 'Передумали — ничего страшного. Остановить ежемесячные пожертвования можно в один клик, без входа в кабинет.',
    link: { label: 'Отменить ежемесячное пожертвование', url: cancelUrl },
  };
}

export function loginCodeMail(to: string, code: string, ttlMinutes: number): MailMessage {
  return compose(to, 'login_code', `Код для входа: ${code}`, [
    { text: `Ваш код для входа в личный кабинет: ${code}` },
    { text: `Он действует ${ttlMinutes} минут и подходит только один раз.` },
    { text: 'Если вы не пытались войти — просто не обращайте внимания на это письмо.' },
  ]);
}

export interface SubscriptionMailInput {
  readonly to: string;
  readonly amountKopecks: bigint;
  readonly timeZone: string;
  readonly cancelUrl: string;
}

export function subscriptionStartedMail(input: SubscriptionMailInput & { readonly nextChargeAt: Date }): MailMessage {
  const amount = formatRubles(input.amountKopecks);

  return compose(input.to, 'subscription_started', 'Ежемесячное пожертвование оформлено', [
    { text: `Спасибо! Первый платёж ${amount} дошёл, и теперь вы каждый месяц помогаете строить мечеть «Шамиль».` },
    { text: `Следующее списание — ${formatDate(input.nextChargeAt, input.timeZone)}, ${amount}. Перед каждым списанием карта не запрашивается.` },
    cancelParagraph(input.cancelUrl),
  ]);
}

export function chargeSucceededMail(
  input: SubscriptionMailInput & { readonly paidAt: Date; readonly nextChargeAt: Date },
): MailMessage {
  const amount = formatRubles(input.amountKopecks);

  return compose(input.to, 'charge_succeeded', `Ежемесячное пожертвование ${amount} получено`, [
    { text: `${formatDate(input.paidAt, input.timeZone)} списано ${amount} на строительство мечети «Шамиль». Да вознаградит вас Всевышний!` },
    { text: `Следующее списание — ${formatDate(input.nextChargeAt, input.timeZone)}.` },
    cancelParagraph(input.cancelUrl),
  ]);
}

export function chargeFailedMail(
  input: SubscriptionMailInput & { readonly retryAt: Date; readonly reason: string | null },
): MailMessage {
  const amount = formatRubles(input.amountKopecks);
  const reason = input.reason === null ? '' : ` Причина от платёжной системы: ${input.reason}.`;

  return compose(input.to, 'charge_failed', 'Не получилось списать ежемесячное пожертвование', [
    { text: `Мы попробовали списать ${amount}, но платёж не прошёл.${reason}` },
    { text: `Ничего делать не нужно: попробуем ещё раз ${formatDate(input.retryAt, input.timeZone)}. Если на карте достаточно средств, всё пройдёт само.` },
    cancelParagraph(input.cancelUrl),
  ]);
}

export type StopReason = 'cancelled' | 'failed';

export function subscriptionStoppedMail(
  input: Omit<SubscriptionMailInput, 'cancelUrl'> & { readonly reason: StopReason; readonly cabinetUrl: string },
): MailMessage {
  const amount = formatRubles(input.amountKopecks);
  const first =
    input.reason === 'cancelled'
      ? `Ежемесячное пожертвование ${amount} отменено. Больше списаний не будет.`
      : `Мы трижды не смогли списать ${amount}, поэтому остановили ежемесячное пожертвование. Больше попыток не будет.`;

  return compose(input.to, `subscription_${input.reason}`, 'Ежемесячное пожертвование остановлено', [
    { text: first },
    { text: 'Спасибо за всё, что вы уже сделали для мечети. Вернуться можно в любой момент.', link: { label: 'Личный кабинет', url: input.cabinetUrl } },
  ]);
}
