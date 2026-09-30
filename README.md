# Мечеть «Шамиль» — сайт сбора пожертвований

Лендинг-сбор на строительство мечети «Шамиль» в Уфе. Домен — `mechetshamil.ru`,
сдача — **5 октября 2026, 12:00**.

Контекст и решения по продукту: [CLAUDE.md](CLAUDE.md) и [CONTEXT.md](CONTEXT.md).
ТЗ — [docs/tz.md](docs/tz.md), план работ — [docs/roadmap.md](docs/roadmap.md).

## Структура

```
apps/api            NestJS + PostgreSQL — кампания, донаты, рейтинги, вебхуки
apps/api/prisma     схема БД и миграции
apps/web            Next.js (App Router) — лендинг, платёжный флоу, OG-превью
docs                ТЗ, роудмап, разбор референса, дизайн и прототипы
```

Решения по схеме БД — [docs/db-schema.md](docs/db-schema.md).

Дизайн-токены живут в [docs/design/tokens.css](docs/design/tokens.css) — это единственный
источник правды по цвету, типографике и отступам. В `apps/web/app/tokens.css` лежит его
побайтовая копия; править нужно оригинал в `docs/design` и копировать заново.

## Требования

- Node.js ≥ 22.12
- Docker (для локального PostgreSQL)

## Запуск

```bash
# 1. Зависимости (npm workspaces — ставятся из корня одной командой)
npm install

# 2. Окружение: скопировать шаблон и заполнить
cp .env.example .env

# 3. База: контейнер, миграции, справочные данные
npm run db:up
npm run db:migrate:deploy --workspace @shamil/api
npm run db:seed --workspace @shamil/api

# 4. Бэкенд (http://localhost:3001/api) и фронтенд (http://localhost:3000)
npm run dev:api
npm run dev:web
```

Проверка, что бэкенд жив: `curl http://localhost:3001/api/health`.

Если порт 5432 занят локально установленным PostgreSQL, поменяйте `POSTGRES_PORT`
в `.env` (и тот же номер в `DATABASE_URL` и `TEST_DATABASE_URL`) — контейнер поднимется
на свободном порту.

## Демо-стенд

Стенд для показа заказчику — https://shamil-web.vercel.app (Vercel + Neon, только
тестовая оплата через эмулятор). Устройство, переменные, передеплой и снос —
[docs/deploy-vercel-demo.md](docs/deploy-vercel-demo.md).

## Локальный запуск с тестовой оплатой

Мерчант Robokassa ещё не зарегистрирован, поэтому полный цикл оплаты гоняется
через **локальный эмулятор страницы оплаты Robokassa**. Через него проходит
настоящий `RobokassaProvider`: подпись ссылки паролем #1, подписанный колбэк
паролем #2 настоящим HTTP-запросом на наш Result URL, возврат на «спасибо».
Деньги не списываются. Переход на настоящую Robokassa — только правка `.env`
(docs/payments-setup.md, «Тестовый режим: эмулятор → Robokassa»).

**1. Допишите в `.env`** (пароли — любые локальные, сгенерируйте свои;
в репозиторий `.env` не попадает):

```bash
PAYMENT_PROVIDER=robokassa
PAYMENT_IS_TEST=true
PAYMENT_MERCHANT_ID=shamil-local
# node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
PAYMENT_TEST_SECRET_KEY=<локальный пароль #1>
PAYMENT_TEST_WEBHOOK_SECRET=<локальный пароль #2>
PAYMENT_HASH_ALGORITHM=md5
PAYMENT_ROBOKASSA_URL=http://localhost:3001/api/dev/robokassa/checkout
PAYMENT_EMULATOR_ENABLED=true
# node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
ADMIN_API_TOKEN=<32+ символа>
```

`PAYMENT_EMULATOR_LINK_SECRET` локально не нужен: без него ключ ссылок эмулятора
случайный на запуск процесса, и после перезапуска бэкенда страницу оплаты надо
открыть заново. На serverless-стенде он обязателен — см.
[docs/deploy-vercel-demo.md](docs/deploy-vercel-demo.md).

**2. Запустите** базу, бэкенд и фронтенд, как в разделе «Запуск». В логе бэкенда
должно быть `ЭМУЛЯТОР ОПЛАТЫ ВКЛЮЧЁН — деньги не списываются`.

**3. Онлайн-оплата:** главная → 100 ₽ → согласие → «Пожертвовать» → страница
эмулятора → «Оплатить: СБП» → «/spasibo» показывает «Ваш вклад дошёл».
Главная обновляется не реже раза в 15 секунд (ISR) — после этого вырастут
«Собрано», число платежей и цель месяца, платёж появится первой строкой ленты.
Регион сейчас приходит только из региональной ссылки: откройте
`http://localhost:3000/?region=02` — и Башкортостан появится в «Географии поддержки».

Сценарии на странице эмулятора:

| Кнопка | Что проверяет |
| --- | --- |
| Оплатить: СБП / Карта / SberPay / T-Pay | Колбэк сразу, способ в ленте |
| Колбэк через 10 с | Поллинг «спасибо» 3 с × 10 ловит поздний колбэк |
| Колбэк через 45 с | Окно поллинга истекло: «Деньги не потеряны», затем повторная проверка → «оплачено» |
| Колбэк дважды | Идемпотентность: сумма выросла один раз |
| Оплатить на 1 ₽ меньше | Расхождение суммы: warn в логе, зачислено по факту |
| Колбэк с битой подписью | 401, донат остаётся `pending` |
| Отказаться от оплаты | Возврат на главную (Fail URL), колбэка нет |

**4. Перевод по реквизитам:** таб «Расчётный счёт» → «Пожертвовать» →
`/donate/transfer?order_id=…`. Подтверждение поступления:

```bash
curl -X POST "http://localhost:3001/api/admin/donations/<order_id>/confirm" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

После него `/spasibo?order_id=<order_id>` показывает «оплачено».

**5. Смоук в браузере** (оба сервера запущены):

```bash
npx playwright install chromium   # или PLAYWRIGHT_CHANNEL=chrome — системный Chrome
node scripts/smoke-test-payment.mjs
```

Скриншоты на 390 и 1440 px — в `Claude outputs/backend-v3-check/`.

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run build` | Сборка обоих приложений |
| `npm run test` | Тесты во всех воркспейсах |
| `npm run lint` | Линтеры во всех воркспейсах |
| `npm run db:up` / `npm run db:down` | Поднять / остановить PostgreSQL |
| `npm run db:migrate --workspace @shamil/api` | Создать миграцию по изменённой схеме |
| `npm run db:migrate:deploy --workspace @shamil/api` | Применить миграции |
| `npm run db:seed --workspace @shamil/api` | Справочные данные: регионы, сбор, цель месяца |
| `npm run db:studio --workspace @shamil/api` | Посмотреть данные глазами |

Тесты схемы работают с настоящим PostgreSQL. Базу для них создаёт сам прогон,
адрес — `TEST_DATABASE_URL`; если сервер недоступен, эти тесты пропускаются
с предупреждением, остальные идут.

## Решения по версиям стека

Три неочевидных места — чтобы никто не «починил» их обратно:

- **NestJS 11, а не 12.** Двенадцатая версия — ESM-only (`"type": "module"` во всех пакетах).
  Это тянет за собой `.js` в относительных импортах, ESM-режим Jest и отдельные грабли
  с ORM. До 5 октября такой переезд не окупается; апгрейд делается после запуска.
- **Сборка через `tsc`, без `@nestjs/cli`.** CLI падает на Node 22.12 с
  `ERR_REQUIRE_CYCLE_MODULE` (`ora` внутри `@angular-devkit/schematics`). NestJS сам по себе
  CLI не требует: `tsc` собирает, `node --watch` перезапускает.
- **`overrides: { "multer": "^2.4.0" }` в корневом package.json.** `@nestjs/platform-express@11`
  тянет multer 2.2.0 с четырьмя DoS-уязвимостями (GHSA-wc9g-mqfw-jrwm и др.). 2.4.0 совместим
  по API. Загрузка фото в галерею пойдёт именно через multer — оставлять было нельзя.

## Правила, которые не отменяются сроком

Полный список — [CONTEXT.md §7](CONTEXT.md). Коротко:

- суммы — **только в копейках**, целым типом, без float;
- донат подтверждается **вебхуком провайдера**, не редиректом с клиента;
- вебхук идемпотентен по внешнему id события, повтор — no-op с ответом 200;
- секреты — только через переменные окружения, `.env` в репозиторий не попадает;
- БД и бэкапы размещаются в РФ (152-ФЗ);
- **хадисы и религиозные тексты не публикуются без выверки заказчиком или имамом** —
  до выверки в вёрстке стоят заглушки.

## Статус

Каркас поднят: репозиторий, монорепозиторий на npm workspaces, NestJS с валидацией
окружения и rate limiting, Next.js с токенами дизайна, PostgreSQL в Docker Compose.
Схема БД, миграции и сиды готовы (день 5) — [docs/db-schema.md](docs/db-schema.md).
Дальше по роудмапу — API кампании, рейтингов и галереи (день 6).
