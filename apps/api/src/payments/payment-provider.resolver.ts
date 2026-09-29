import { BadRequestException } from '@nestjs/common';

import type { PaymentChannel } from '../config/constants';
import type { PaymentProvider } from './payment-provider.interface';

/** Текст для донатера: онлайн сейчас нельзя, но деньги принять можно. */
export const ONLINE_UNAVAILABLE_MESSAGE =
  'Онлайн-оплата временно недоступна — переведите по реквизитам';

/**
 * Провайдеры приложения. Собирается фабрикой `PaymentsModule` из конфига;
 * тесты подставляют стабы напрямую.
 */
export interface PaymentProviderRegistry {
  /** Перевод по реквизитам есть всегда — это постоянный путь, не заглушка. */
  readonly manual: PaymentProvider;
  /** Онлайн-агрегатор; `null`, если он выключен (`PAYMENT_PROVIDER=manual`). */
  readonly online: PaymentProvider | null;
  /** Канал запроса без `channel` — поведение до появления поля. */
  readonly defaultChannel: PaymentChannel;
}

/**
 * Выбор провайдера по донату.
 *
 * До появления `channel` провайдер был один на приложение — и при активной
 * Robokassa человек, нажавший «Расчётный счёт», уехал бы на оплату картой.
 * Теперь провайдер выбирается по каналу из формы, а колбэк и админка берут
 * провайдера по коду, записанному в донате, а не по глобальной настройке.
 */
export class PaymentProviderResolver {
  constructor(private readonly registry: PaymentProviderRegistry) {}

  /**
   * `transfer` — всегда ручной перевод. `online` — агрегатор, а если он
   * выключен, 400 с человеческим текстом: молча отправить на реквизиты
   * того, кто выбрал «Онлайн», значит показать не ту страницу.
   * Без канала — `PAYMENT_PROVIDER`, как было до поля.
   */
  forChannel(channel?: PaymentChannel): PaymentProvider {
    switch (channel ?? this.registry.defaultChannel) {
      case 'transfer':
        return this.registry.manual;

      case 'online':
        if (this.registry.online === null) {
          throw new BadRequestException(ONLINE_UNAVAILABLE_MESSAGE);
        }

        return this.registry.online;
    }
  }

  /**
   * Провайдер по коду — для маршрута колбэка конкретного агрегатора.
   * `null` — такой провайдер в приложении не включён, и его колбэк
   * обязан получить 401, как любой неподписанный запрос.
   */
  byCode(code: string): PaymentProvider | null {
    const candidates = [this.registry.manual, this.registry.online];

    return candidates.find((provider) => provider?.code === code) ?? null;
  }
}
