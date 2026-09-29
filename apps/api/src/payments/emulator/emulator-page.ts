import { EMULATOR_METHODS } from './emulator.constants';
import type { EmulatorMethod, EmulatorScenario } from './emulator.constants';

/**
 * HTML страницы эмулятора. Без JS: helmet ставит `script-src 'self'`, а форма
 * с редиректом на другой origin упирается в `form-action 'self'` в Chromium.
 * Поэтому сценарии — обычные GET-ссылки, и CSP трогать не нужно.
 *
 * Всё, что пришло из query (описание, сумма, номер), экранируется: страница
 * рендерит чужой ввод, и `Description=<script>` не должен стать скриптом.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const STYLES = `
  body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0A3367;color:#0A3367}
  main{max-width:560px;margin:32px auto;padding:0 16px}
  .card{background:#fff;border-radius:16px;padding:24px}
  .badge{display:inline-block;background:#FFE08A;color:#5A4300;border-radius:8px;padding:4px 10px;font-weight:600}
  h1{font-size:22px;margin:16px 0 4px} .sum{font-size:32px;font-weight:700;color:#026AA9}
  dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:16px 0} dt{color:#556}
  .row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 20px}
  a.btn{display:inline-block;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600}
  a.primary{background:#026AA9;color:#fff} a.secondary{background:#E8F1F8;color:#0A3367}
  a.danger{background:#FDECEC;color:#8A1C1C} h2{font-size:16px;margin:8px 0}
  .error{border-left:4px solid #C62828;padding-left:12px}
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><style>${STYLES}</style></head>
<body><main><div class="card">
<span class="badge">Эмулятор Robokassa · тестовый режим · деньги не списываются</span>
${body}
</div></main></body></html>`;
}

export interface CheckoutView {
  readonly outSum: string;
  readonly invId: string;
  readonly description: string;
  /** Ссылки сценариев: оплата каждым способом и тестовые сценарии через СБП. */
  readonly payLinks: Readonly<Record<EmulatorMethod, string>>;
  readonly scenarioLinks: Readonly<Record<Exclude<EmulatorScenario, 'pay'>, string>>;
}

function link(href: string, label: string, kind: 'primary' | 'secondary' | 'danger'): string {
  return `<a class="btn ${kind}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

export function renderCheckoutPage(view: CheckoutView): string {
  const methods = (Object.keys(EMULATOR_METHODS) as EmulatorMethod[])
    .map((method) => link(view.payLinks[method], `Оплатить: ${EMULATOR_METHODS[method].label}`, 'primary'))
    .join('\n');
  const { scenarioLinks: s } = view;

  return layout(
    'Эмулятор Robokassa',
    `<h1>Оплата пожертвования</h1>
<div class="sum">${escapeHtml(view.outSum)} ₽</div>
<dl><dt>Назначение</dt><dd>${escapeHtml(view.description)}</dd>
<dt>Номер счёта</dt><dd>${escapeHtml(view.invId)}</dd></dl>
<h2>Способ оплаты — колбэк сразу</h2>
<div class="row">${methods}</div>
<h2>Тестовые сценарии (через СБП)</h2>
<div class="row">
${link(s.pay_delay_10, 'Колбэк через 10 с', 'secondary')}
${link(s.pay_delay_45, 'Колбэк через 45 с', 'secondary')}
${link(s.pay_twice, 'Колбэк дважды', 'secondary')}
${link(s.pay_underpaid, 'Оплатить на 1 ₽ меньше', 'secondary')}
</div>
<div class="row">
${link(s.bad_signature, 'Колбэк с битой подписью', 'danger')}
${link(s.refuse, 'Отказаться от оплаты', 'danger')}
</div>`,
  );
}

export function renderErrorPage(message: string): string {
  return layout(
    'Эмулятор Robokassa: ошибка',
    `<h1>Ссылка на оплату отклонена</h1>
<p class="error">${escapeHtml(message)}</p>
<p>Настоящая Robokassa отклонила бы эту ссылку так же. Проверьте пароль #1,
<code>PAYMENT_MERCHANT_ID</code> и алгоритм подписи в <code>.env</code>.</p>`,
  );
}
