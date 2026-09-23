# Robokassa: кабинет ↔ `.env` (под текущий код)

> Короткий чек-лист на момент регистрации магазина: что скопировать **из кабинета
> Robokassa в `.env`** и что вбить **обратно в кабинет**. Сверено с кодом
> `apps/api/src/config/env.validation.ts`, `config/configuration.ts` и
> `payments/robokassa/*` — 21.09.2026. Общий контекст — [payments-setup.md](payments-setup.md).

---

## A. Из кабинета Robokassa → в `.env`

Активная пара паролей выбирается кодом по `PAYMENT_IS_TEST` (`configuration.ts` →
`buildPaymentConfig`). Заполняй ту пару, в которой сейчас работаешь; вторую можно
оставить пустой.

| В кабинете Robokassa | Переменная `.env` | Примечание |
|---|---|---|
| Идентификатор магазина (`MerchantLogin`) | `PAYMENT_MERCHANT_ID` | обязателен при `robokassa` |
| **Тестовый** Пароль #1 | `PAYMENT_TEST_SECRET_KEY` | подпись исходящей ссылки, тест |
| **Тестовый** Пароль #2 | `PAYMENT_TEST_WEBHOOK_SECRET` | проверка подписи колбэка, тест |
| **Боевой** Пароль #1 | `PAYMENT_SECRET_KEY` | подпись исходящей ссылки, бой |
| **Боевой** Пароль #2 | `PAYMENT_WEBHOOK_SECRET` | проверка подписи колбэка, бой |
| Хеш-алгоритм подписи (Технические настройки) | `PAYMENT_HASH_ALGORITHM` | `md5` (по умолчанию) или `sha256` — **должен совпадать с выбранным в кабинете** |

Плюс два переключателя, которые задаёшь сам (не из кабинета):

```
PAYMENT_PROVIDER=robokassa
PAYMENT_IS_TEST=true      # true — тестовая пара, false — боевая
```

Важно по коду:
- `PAYMENT_IS_TEST` **не имеет значения по умолчанию** — при `robokassa` его надо
  задать явно, иначе приложение не стартует. Принимает `1/true/yes/on` и `0/false/no/off`;
  любое другое значение (`PAYMENT_IS_TEST=test` и т.п.) роняет старт с именем переменной.
- В тестовом режиме код требует **только тестовую пару**, в боевом — **только боевую**.
  Пустая неактивная пара — это норма, а не ошибка (`env.validation.ts`, `@ValidateIf`).
- Фискализация выключена: `PAYMENT_RECEIPT_ENABLED=false`, поля `PAYMENT_RECEIPT_SNO` /
  `_ITEM_NAME` / `_VAT` **оставляем пустыми**. Если включить — код потребует все три,
  и `Receipt` начнёт участвовать в строке подписи (`robokassa.provider.ts`).

## B. Из `.env` / кода → обратно в кабинет (Технические настройки)

Адреса приложение за NAT/Nginx о себе не знает — их собираешь из `PUBLIC_API_URL`
и `PUBLIC_SITE_URL` и вбиваешь в кабинет вручную.

| Поле в кабинете | Значение | Откуда в коде |
|---|---|---|
| **Result URL** | `{PUBLIC_API_URL}/api/payments/robokassa/result` | `buildResultUrl()` в `robokassa.constants.ts`; префикс `/api` = `API_GLOBAL_PREFIX` |
| Метод Result URL | **POST** | контроллер слушает только `@Post` (`payment-callbacks.controller.ts`) |
| **Success URL** | `{PUBLIC_SITE_URL}/spasibo` | `THANKS_PATH` (`payments.constants.ts`) |
| **Fail URL** | `{PUBLIC_SITE_URL}/` (или отдельная страница отказа) | своей fail-страницы в коде пока нет |
| Хеш-алгоритм подписи | тот же, что в `PAYMENT_HASH_ALGORITHM` | иначе все подписи не сойдутся |
| URL сайта магазина | `https://mechetshamil.ru` | — |

Пример при боевом домене `https://mechetshamil.ru` и API на том же домене за Nginx
(`PUBLIC_API_URL=https://mechetshamil.ru`):

```
Result URL:  https://mechetshamil.ru/api/payments/robokassa/result   (POST)
Success URL: https://mechetshamil.ru/spasibo
Fail URL:    https://mechetshamil.ru/
```

## C. Локальный прогон до боевых ключей

Result URL должен быть публично доступен по HTTPS — Robokassa стучится снаружи.
Локально поднимаешь туннель на порт API (`API_PORT`, по умолчанию 3001):

```
cloudflared tunnel --url http://localhost:3001
# или: ngrok http 3001
```

Публичный адрес туннеля кладёшь в `PUBLIC_API_URL`, а в кабинет как Result URL —
`{адрес-туннеля}/api/payments/robokassa/result` (POST). `PAYMENT_IS_TEST=true`,
заполнена тестовая пара — можно гонять полный флоу, не дожидаясь модерации мерчанта.

## D. Быстрая самопроверка

- [ ] `PAYMENT_PROVIDER=robokassa`, `PAYMENT_IS_TEST` задан явно
- [ ] Заполнена пара под текущий режим (тест или бой)
- [ ] `PAYMENT_HASH_ALGORITHM` в `.env` = алгоритм в кабинете
- [ ] Result URL в кабинете = `{PUBLIC_API_URL}/api/payments/robokassa/result`, метод **POST**
- [ ] Success URL = `{PUBLIC_SITE_URL}/spasibo`, Fail URL задан
- [ ] `.env` не в гите (уже в `.gitignore`), секреты только в окружении

---

### Заметки на потом (не блокеры регистрации)

- **Success URL и `order_id`.** Страница `/spasibo` опрашивает статус по query-параметру
  `order_id` (`app/spasibo/page.tsx` → `ThanksScreen`). Robokassa на Success-редиректе
  отдаёт `InvId`, а не `order_id`. В тестовом прогоне сверить, с каким именем параметр
  реально приходит, и при необходимости настроить Success URL / чтение параметра — иначе
  после оплаты страница «спасибо» не получит id заказа и не запустит поллинг.
- **`docs/payments-checklist.md`** в блоке «Итоговый `.env`» отстал от кода: там
  `PAYMENT_IS_TEST=1` (в коде булев флаг, читается `true/false`) и несуществующая
  `PAYMENT_PUBLIC_URL` (в коде — `PUBLIC_API_URL` / `PUBLIC_SITE_URL`), нет
  `PAYMENT_HASH_ALGORITHM`. Стоит поправить, чтобы два чек-листа не расходились.
