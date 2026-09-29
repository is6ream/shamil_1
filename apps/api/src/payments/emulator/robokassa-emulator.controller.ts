import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsHexadecimal, IsString, Length, MaxLength } from 'class-validator';
import type { Response } from 'express';

import { CheckoutRejectedError } from './checkout-request';
import { EMULATOR_CHECKOUT_ROUTE, EMULATOR_PAY_ROUTE, EMULATOR_ROUTE_PREFIX } from './emulator.constants';
import { renderErrorPage } from './emulator-page';
import { RobokassaEmulatorService } from './robokassa-emulator.service';
import { ScenarioLinkError } from './scenario-link';

/** Длина HMAC-SHA256 в hex. */
const HMAC_HEX_LENGTH = 64;

/** Сценарий с его JSON в base64url — заказ, сумма, Shp_ — укладывается с запасом. */
const MAX_PAYLOAD_LENGTH = 2048;

/** Query ссылки сценария: ровно два параметра, лишний — 400. */
export class ScenarioQueryDto {
  @IsString()
  @MaxLength(MAX_PAYLOAD_LENGTH)
  p!: string;

  @IsHexadecimal()
  @Length(HMAC_HEX_LENGTH, HMAC_HEX_LENGTH)
  s!: string;
}

function sendHtml(res: Response, status: HttpStatus, html: string): void {
  res.status(status).type('html').setHeader('Cache-Control', 'no-store').send(html);
}

/**
 * Страница оплаты эмулятора и её сценарии. Маршруты существуют только
 * при `PAYMENT_EMULATOR_ENABLED=true`: модуль подключается условно, и в
 * production (где флаг запрещён валидацией) их нет вовсе — ответ 404.
 *
 * `@SkipThrottle`: это инструмент разработчика, а сквозные тесты гоняют
 * страницу десятки раз подряд.
 */
@Controller(EMULATOR_ROUTE_PREFIX)
@SkipThrottle()
export class RobokassaEmulatorController {
  constructor(private readonly emulator: RobokassaEmulatorService) {}

  /**
   * Query принимается как есть, без DTO: имена `Shp_*` произвольные.
   * Строгая проверка состава и подписи — в `parseCheckoutRequest`;
   * отказ — HTML-страница ошибки со статусом 400, как у Robokassa.
   */
  @Get(EMULATOR_CHECKOUT_ROUTE)
  checkout(@Query() query: Record<string, unknown>, @Res() res: Response): void {
    try {
      sendHtml(res, HttpStatus.OK, this.emulator.renderCheckout(query));
    } catch (error: unknown) {
      if (error instanceof CheckoutRejectedError) {
        sendHtml(res, HttpStatus.BAD_REQUEST, renderErrorPage(error.message));

        return;
      }

      throw error;
    }
  }

  @Get(EMULATOR_PAY_ROUTE)
  async pay(@Query() query: ScenarioQueryDto, @Res() res: Response): Promise<void> {
    try {
      res.redirect(HttpStatus.FOUND, await this.emulator.runScenario(query));
    } catch (error: unknown) {
      if (error instanceof ScenarioLinkError) {
        sendHtml(res, HttpStatus.BAD_REQUEST, renderErrorPage(error.message));

        return;
      }

      throw error;
    }
  }
}
