import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { API_GLOBAL_PREFIX } from './config/constants';
import type { AppConfig } from './config/configuration';
import { PaymentProviderCode } from './config/env.validation';
import { buildResultUrl } from './payments/robokassa/robokassa.constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Вебхуки платёжных провайдеров подписывают именно сырое тело запроса.
    // Подпись проверяется до разбора JSON, поэтому сырой буфер нужен всегда.
    rawBody: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const http = config.get('http', { infer: true });

  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: [...http.corsOrigins], credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(http.port);

  Logger.log(
    `Бэкенд слушает http://localhost:${http.port}/${API_GLOBAL_PREFIX}`,
    'Bootstrap',
  );

  const payment = config.get('payment', { infer: true });

  if (payment.provider === PaymentProviderCode.Robokassa) {
    // Режим печатается только здесь: у ручного перевода по реквизитам
    // тестового режима не существует, и «manual (ТЕСТОВЫЙ РЕЖИМ)» в логе
    // читался бы как «платежи ненастоящие», хотя они как раз настоящие.
    Logger.log(
      `Платежи: robokassa${payment.isTest ? ' — ТЕСТОВЫЙ РЕЖИМ, деньги не списываются' : ' — БОЕВОЙ РЕЖИМ'}`,
      'Bootstrap',
    );

    // Адрес колбэка при каждом старте: расхождение между тем, что настроено
    // в кабинете Robokassa, и тем, что слушает приложение, выглядит
    // как «платежи не подтверждаются» и ищется долго.
    const publicUrls = config.get('publicUrls', { infer: true });

    Logger.log(
      `Result URL для кабинета: ${buildResultUrl(publicUrls.apiUrl, API_GLOBAL_PREFIX)}`,
      'Bootstrap',
    );
  } else {
    Logger.log('Платежи: ручной перевод по реквизитам', 'Bootstrap');
  }
}

void bootstrap();
