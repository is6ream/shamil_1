import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { API_GLOBAL_PREFIX } from '../../config/constants';
import type { AppConfig, PaymentConfig } from '../../config/configuration';
import { THANKS_PATH } from '../payments.constants';
import { buildResultUrl } from '../robokassa/robokassa.constants';
import { buildCallbackBody, buildSuccessParams } from './callback-body';
import type { CallbackOptions } from './callback-body';
import { parseCheckoutRequest } from './checkout-request';
import type { CheckoutOrder } from './checkout-request';
import {
  DEFAULT_EMULATOR_METHOD,
  EMULATOR_CHECKOUT_ROUTE,
  EMULATOR_METHODS,
  EMULATOR_PAY_ROUTE,
  EMULATOR_ROUTE_PREFIX,
  LONG_CALLBACK_DELAY_MS,
  SCENARIO_LINK_TTL_MS,
  SHORT_CALLBACK_DELAY_MS,
} from './emulator.constants';
import type { EmulatorMethod, EmulatorScenario } from './emulator.constants';
import { renderCheckoutPage } from './emulator-page';
import type { CheckoutView } from './emulator-page';
import { signScenario, verifyScenario } from './scenario-link';
import type { ScenarioOrder, SignedScenario } from './scenario-link';

/** HMAC-ключ ссылок сценариев: 32 случайных байта на запуск процесса. */
const LINK_KEY_BYTES = 32;

/** Путь Fail URL — главная (docs/robokassa-activation.md, блок 4). */
const FAIL_PATH = '/';

/** Статус, которым наш бэкенд обязан ответить на битую подпись. */
const UNAUTHORIZED = 401;

@Injectable()
export class RobokassaEmulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RobokassaEmulatorService.name);

  private readonly payment: PaymentConfig;
  private readonly resultUrl: string;
  private readonly siteUrl: string;
  private readonly apiUrl: string;
  private readonly linkKey = randomBytes(LINK_KEY_BYTES);
  /** Отложенные колбэки: гасятся при остановке, чтобы не стрелять в закрытое приложение. */
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.payment = config.get('payment', { infer: true });

    const publicUrls = config.get('publicUrls', { infer: true });

    this.apiUrl = publicUrls.apiUrl;
    this.siteUrl = publicUrls.siteUrl;
    this.resultUrl = buildResultUrl(publicUrls.apiUrl, API_GLOBAL_PREFIX);
  }

  onModuleInit(): void {
    this.logger.warn('ЭМУЛЯТОР ОПЛАТЫ ВКЛЮЧЁН — деньги не списываются');
    this.logger.warn(`Колбэки эмулятора уходят на ${this.resultUrl}`);

    const checkoutUrl = buildEmulatorCheckoutUrl(this.apiUrl);

    if (this.payment.paymentUrl !== checkoutUrl) {
      // Эмулятор включён, а ссылки оплаты ведут мимо него — «Внести» уведёт
      // на настоящую Robokassa с локальными паролями, и она ссылку отвергнет.
      this.logger.warn(`PAYMENT_ROBOKASSA_URL не указывает на эмулятор; ожидалось ${checkoutUrl}`);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }

  /** Страница оплаты: ссылка проверяется так же строго, как Robokassa. */
  renderCheckout(query: Readonly<Record<string, unknown>>, now: number = Date.now()): string {
    const order = parseCheckoutRequest(query, this.payment);

    return renderCheckoutPage(this.buildView(order, now));
  }

  /**
   * Сценарий: колбэк (сразу, с задержкой, дважды, битый) и адрес, куда
   * отправить браузер. Колбэк — настоящий HTTP-запрос на Result URL, а не
   * вызов сервиса: так проверяются парсер urlencoded, троттлинг, подпись
   * и ответ `OK{InvId}` целиком.
   */
  async runScenario(signed: SignedScenario): Promise<string> {
    const { order, scenario, method } = verifyScenario(this.linkKey, signed);

    await this.dispatch(scenario, order, method);

    return scenario === 'refuse' ? `${this.siteUrl}${FAIL_PATH}` : this.successUrl(order);
  }

  private async dispatch(scenario: EmulatorScenario, order: ScenarioOrder, method: EmulatorMethod): Promise<void> {
    switch (scenario) {
      case 'pay':
        return this.sendCallback(order, { method });

      case 'pay_twice':
        await this.sendCallback(order, { method });

        return this.sendCallback(order, { method });

      case 'pay_underpaid':
        return this.sendCallback(order, { method, underpaid: true });

      case 'bad_signature':
        return this.sendCallback(order, { method, badSignature: true });

      case 'pay_delay_10':
        return this.schedule(order, { method }, SHORT_CALLBACK_DELAY_MS);

      case 'pay_delay_45':
        return this.schedule(order, { method }, LONG_CALLBACK_DELAY_MS);

      case 'refuse':
        // Отказ: Robokassa не шлёт колбэк, донат остаётся pending.
        return;
    }
  }

  /** Отложенный колбэк: браузер ответа не ждёт, ошибки таймера логируются. */
  private schedule(order: ScenarioOrder, options: CallbackOptions, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.sendCallback(order, options).catch((error: unknown) => {
        this.logger.error(
          `Отложенный колбэк по счёту ${order.invId} упал: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delayMs);

    this.timers.add(timer);
    this.logger.log(`Колбэк по счёту ${order.invId} уйдёт через ${delayMs / 1000} с`);
  }

  /**
   * Тело колбэка не логируется: в нём почта плательщика — так же, как
   * у настоящего колбэка в контроллере.
   */
  private async sendCallback(order: ScenarioOrder, options: CallbackOptions): Promise<void> {
    const body = buildCallbackBody(order, this.payment, options);
    const response = await fetch(this.resultUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    const answer = await response.text();

    if (options.badSignature === true) {
      if (response.status === UNAUTHORIZED) {
        this.logger.log(`Колбэк с битой подписью по счёту ${order.invId} отклонён: 401, как и должно быть`);
      } else {
        this.logger.error(
          `Колбэк с битой подписью по счёту ${order.invId} получил ${response.status} вместо 401`,
        );
      }

      return;
    }

    if (response.ok && answer === `OK${order.invId}`) {
      this.logger.log(`Колбэк по счёту ${order.invId} принят: ${answer}`);

      return;
    }

    // Robokassa ретраила бы такой колбэк — здесь это надо увидеть сразу.
    this.logger.error(
      `Колбэк по счёту ${order.invId}: ответ ${response.status}, ожидалось OK${order.invId}`,
    );
  }

  private successUrl(order: ScenarioOrder): string {
    const url = new URL(`${this.siteUrl}${THANKS_PATH}`);

    for (const [name, value] of Object.entries(buildSuccessParams(order, this.payment))) {
      url.searchParams.set(name, value);
    }

    return url.toString();
  }

  private buildView(order: CheckoutOrder, now: number): CheckoutView {
    const scenarioOrder: ScenarioOrder = { outSum: order.outSum, invId: order.invId, shp: order.shp };
    const linkFor = (scenario: EmulatorScenario, method: EmulatorMethod): string =>
      this.scenarioLink(scenarioOrder, scenario, method, now);

    const payLinks = Object.fromEntries(
      (Object.keys(EMULATOR_METHODS) as EmulatorMethod[]).map((method) => [method, linkFor('pay', method)]),
    ) as Record<EmulatorMethod, string>;

    return {
      outSum: order.outSum,
      invId: order.invId,
      description: order.description,
      payLinks,
      scenarioLinks: {
        pay_delay_10: linkFor('pay_delay_10', DEFAULT_EMULATOR_METHOD),
        pay_delay_45: linkFor('pay_delay_45', DEFAULT_EMULATOR_METHOD),
        pay_twice: linkFor('pay_twice', DEFAULT_EMULATOR_METHOD),
        pay_underpaid: linkFor('pay_underpaid', DEFAULT_EMULATOR_METHOD),
        bad_signature: linkFor('bad_signature', DEFAULT_EMULATOR_METHOD),
        refuse: linkFor('refuse', DEFAULT_EMULATOR_METHOD),
      },
    };
  }

  private scenarioLink(order: ScenarioOrder, scenario: EmulatorScenario, method: EmulatorMethod, now: number): string {
    const signed = signScenario(this.linkKey, {
      order,
      scenario,
      method,
      expiresAt: now + SCENARIO_LINK_TTL_MS,
    });
    const url = new URL(`${this.apiUrl}/${API_GLOBAL_PREFIX}/${EMULATOR_ROUTE_PREFIX}/${EMULATOR_PAY_ROUTE}`);

    url.searchParams.set('p', signed.p);
    url.searchParams.set('s', signed.s);

    return url.toString();
  }
}

/** Путь страницы оплаты — его вписывают в `PAYMENT_ROBOKASSA_URL`. */
export function buildEmulatorCheckoutUrl(publicApiUrl: string): string {
  return `${publicApiUrl}/${API_GLOBAL_PREFIX}/${EMULATOR_ROUTE_PREFIX}/${EMULATOR_CHECKOUT_ROUTE}`;
}
