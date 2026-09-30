# Демо-стенд на Vercel

Стенд для показа заказчику полного цикла тестовой оплаты. Поднят 30.09.2026
из ветки `chore/vercel-demo`. **Это не боевой сайт:** оплата идёт только через
эмулятор Robokassa, деньги не списываются, база находится за пределами РФ.

| Что | Адрес |
| --- | --- |
| Сайт | https://shamil-web.vercel.app |
| API (health) | https://shamil-api.vercel.app/api/health |

## Схема

```
браузер ──► shamil-web (Vercel, Next.js, fra1) ──SSR/ISR──► shamil-api (Vercel, NestJS, fra1) ──► Neon Postgres (Франкфурт)
   │                                                            ▲   │
   └──── «Пожертвовать» → /api/dev/robokassa/checkout ──────────┘   └── колбэк эмулятора: POST на свой
                                                                        /api/payments/robokassa/result
```

| Что | Где | Настройки |
| --- | --- | --- |
| БД | Neon, проект `shamil-demo`, `aws-eu-central-1` | база `neondb`, роль `neondb_owner` |
| Бэкенд | Vercel-проект `shamil-api` | Root Directory `apps/api`, framework `nestjs`, Node 22.x, функции в `fra1` |
| Фронт | Vercel-проект `shamil-web` | Root Directory `apps/web`, framework `nextjs`, Node 22.x, функции в `fra1` |

Оба проекта — в команде `danils-projects-3a1240df` (Hobby), с включённым
«Include files outside Root Directory» (`sourceFilesOutsideRootDirectory`) —
без него не видны npm workspaces и корневой `package-lock.json`.

Деплой — через Vercel CLI из корня репозитория, без Git-интеграции: на стенд
уезжает текущее рабочее дерево. Что не загружается — в [`.vercelignore`](../.vercelignore)
(CLI не читает `.gitignore`, поэтому `.env*` там перечислены явно).

## Переменные окружения (значения — только в Vercel и в локальном `.env.deploy.local`)

### `shamil-api`, окружение production

| Переменная | Значение / источник |
| --- | --- |
| `NODE_ENV` | `production` |
| `DEPLOY_STAGE` | `demo` — единственное, что разрешает эмулятор при `NODE_ENV=production` |
| `DATABASE_URL` | pooled-строка Neon (`-pooler`), `sslmode=verify-full` |
| `CORS_ORIGINS` | web-алиас |
| `PUBLIC_API_URL` | api-алиас |
| `PUBLIC_SITE_URL` | web-алиас |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | `60000` / `60` |
| `PAYMENT_PROVIDER` | `robokassa` |
| `PAYMENT_IS_TEST` | `true` |
| `PAYMENT_MERCHANT_ID` | `shamil-demo` |
| `PAYMENT_TEST_SECRET_KEY` | `DEMO_PAYMENT_TEST_SECRET_KEY` |
| `PAYMENT_TEST_WEBHOOK_SECRET` | `DEMO_PAYMENT_TEST_WEBHOOK_SECRET` |
| `PAYMENT_HASH_ALGORITHM` | `md5` |
| `PAYMENT_ROBOKASSA_URL` | `<api-алиас>/api/dev/robokassa/checkout` |
| `PAYMENT_EMULATOR_ENABLED` | `true` |
| `PAYMENT_EMULATOR_LINK_SECRET` | `DEMO_EMULATOR_LINK_SECRET` |
| `PAYMENT_RECEIPT_ENABLED` | `false` |
| `ADMIN_API_TOKEN` | `DEMO_ADMIN_API_TOKEN` |

### `shamil-web`, окружение production

| Переменная | Значение |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `<api-алиас>/api` |
| `NEXT_PUBLIC_SITE_URL` | web-алиас |

`NEXT_PUBLIC_*` вшиваются при сборке: сменили — пересоберите фронт.

### Локальный `.env.deploy.local` (в git не попадает, правило `.env.*.local`)

`VERCEL_TOKEN`, `NEON_API_KEY` — вводит владелец аккаунтов. Остальное дописывается
при подъёме стенда: `NEON_PROJECT_ID`, `NEON_DATABASE_URL_POOLED`,
`NEON_DATABASE_URL_DIRECT` (в одинарных кавычках — в строке есть `&`, без кавычек
`source` теряет значение), `DEMO_PAYMENT_TEST_SECRET_KEY`,
`DEMO_PAYMENT_TEST_WEBHOOK_SECRET`, `DEMO_EMULATOR_LINK_SECRET`, `DEMO_ADMIN_API_TOKEN`
(по 48 hex-символов, `randomBytes(24)`).

## Что поменялось в коде ради serverless

| Ловушка | Решение |
| --- | --- |
| Vercel отдаёт функции `NODE_ENV=production`, а валидация запрещает там эмулятор | Переменная `DEPLOY_STAGE` (`local`/`demo`/`production`). Запреты снимает только `demo`; при любом другом значении production проверяется как раньше. На старте — `ДЕМО-СТЕНД: эмулятор оплаты разрешён в production…` |
| Ключ ссылок эмулятора жил в памяти процесса — разные инстансы и холодный старт давали «ссылка недействительна» | `PAYMENT_EMULATOR_LINK_SECRET`; без него — прежний случайный ключ и предупреждение в логе |
| Отложенные колбэки на `setTimeout` — функция может замёрзнуть после ответа | Колбэк регистрируется в `waitUntil` из `@vercel/functions` (вне Vercel — no-op) |
| Хостинг назначает порт сам | `PORT` приоритетнее `API_PORT` |
| Стенд не должен попасть в поиск | `apps/web/vercel.json` — `X-Robots-Tag: noindex, nofollow` на все пути |

Эмулятор по-прежнему лежит в `apps/api/src/payments/emulator/`; настоящий
`RobokassaProvider`, подпись, `PaymentsService`, схема БД и миграции не менялись.

## Решения (журнал)

| Развилка | Выбрано | Почему |
| --- | --- | --- |
| Незакоммиченные правки лендинга (шаг 0 промпта) | Коммитить нечего | На момент старта рабочее дерево было чистым: правки уже вошли в `51d0237` |
| Куда положить ключ ссылок эмулятора | Поле `emulatorLinkSecret` в `PaymentConfig` | Эмулятор уже берёт из `payment` пароли и адрес; отдельный блок конфига ради одного поля — лишнее |
| Коммиты 4.1 / 4.2 / 4.3 по отдельности | Два коммита: схема окружения (стадия, порт, ключ) и сервис эмулятора (ключ + `waitUntil`) | Все три переменные правят одни и те же строки `env.validation.ts`/`configuration.ts`, а 4.1 и 4.3 — один метод сервиса; разрезать их без интерактивного `git add -p` значило бы коммитить несобираемые промежуточные состояния |
| Neon: `neonctl me` падает | Не блокер | Ключ — организационный (`not allowed for organization API keys`); `projects list/create` работают, проект создан с `--org-id` |
| `sslmode` в `DATABASE_URL` на Vercel | `verify-full` вместо `require` | `pg` и так трактует `require` как `verify-full` и пишет SECURITY WARNING в каждый холодный старт; явное значение то же по смыслу, без шума в логах |
| Регион функций | `fra1` для обоих проектов | По умолчанию `iad1` (США): каждый запрос к базе во Франкфурте шёл бы через океан |
| Привязка CLI к проекту | Переменные `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` вместо `vercel link` | Два проекта из одного корня: `vercel link` перезаписывал бы `.vercel/project.json` при каждом переключении. `.vercel/` всё равно добавлен в `.gitignore` |
| Deployment Protection | Не трогали | По умолчанию стоит `all_except_custom_domains`, но production-алиасы `*.vercel.app` отвечают 200 без логина — проверено `curl` без кук. Адреса конкретных деплоев закрыты, и это правильно |
| `maxDuration` | Не задавали | Hobby + Fluid compute: лимит по умолчанию 300 с, колбэк через 45 с укладывается |
| Запасной путь «колбэк через 10 с работает только локально» | Не понадобился | На стенде «Колбэк через 10 с» доходит, `/spasibo` ловит оплату |
| Сценарий «перевод по реквизитам» | Заказ создаётся `POST /donations` с `channel: "transfer"`, дальше — `/donate/transfer`, подтверждение `curl` из админки, `/spasibo` | В форме макета v2 таба «Расчётный счёт» нет (`ChannelTabs` не подключён, форма ссылается на блок реквизитов). Тело запроса — то же, что собирает `buildCreateDonationBody` |
| Смоук `scripts/smoke-test-payment.mjs` | Запущен без правок, скриншоты перенесены в `Claude outputs/vercel-demo-check/smoke-*` | Скрипт пишет в `backend-v3-check/`; прежние файлы оттуда восстановлены из копии |
| Тестовые донаты после проверки | Оставлены | На пустой витрине заказчику показывать нечего; в отчёте явно сказано, что цифры тестовые |

## Как передеплоить

Из корня репозитория, в Git Bash:

```bash
set -a; source .env.deploy.local; set +a
# бэкенд
VERCEL_ORG_ID=team_NqD2eCbrOop6B4l0LOExFK3I VERCEL_PROJECT_ID=prj_kMOxlNU5W2HgU9bPUH0Inbhuapq2 \
  npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
# фронт
VERCEL_ORG_ID=team_NqD2eCbrOop6B4l0LOExFK3I VERCEL_PROJECT_ID=prj_bA9vkI2T9UQHRgJudJTGrFweJK5e \
  npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

Новые миграции — по **direct**-строке (не pooled):

```bash
DATABASE_URL="$NEON_DATABASE_URL_DIRECT" npm run db:migrate:deploy -w @shamil/api
```

Проверка стенда целиком (~4 минуты, создаёт тестовые донаты):

```bash
SITE_URL=https://shamil-web.vercel.app API_URL=https://shamil-api.vercel.app/api \
  ADMIN_API_TOKEN="$DEMO_ADMIN_API_TOKEN" node scripts/vercel-demo-check.mjs
```

Логи: `npx vercel logs -p shamil-api --scope danils-projects-3a1240df --since 30m -x --token "$VERCEL_TOKEN"`.

## Сброс тестовых данных

Все донаты на стенде — тестовые. Полный сброс к состоянию «сразу после сидов»
(удаляет все данные в базе стенда):

```bash
cd apps/api
DATABASE_URL="$NEON_DATABASE_URL_DIRECT" npx prisma migrate reset --force
DATABASE_URL="$NEON_DATABASE_URL_DIRECT" npm run db:seed
```

`migrate reset` пересоздаёт схему и накатывает миграции; сиды — на `upsert`,
повторный запуск безопасен. Главная обновится в течение 15 секунд (ISR).

Альтернатива без SQL — пересоздать стенд с нуля: удалить Neon-проект
(см. ниже), создать новый, накатить миграции и сиды, обновить `DATABASE_URL`
в `shamil-api` и передеплоить бэкенд.

## Как снести стенд

```bash
npx vercel project rm shamil-api --scope danils-projects-3a1240df --token "$VERCEL_TOKEN"
npx vercel project rm shamil-web --scope danils-projects-3a1240df --token "$VERCEL_TOKEN"
npx neonctl projects delete "$NEON_PROJECT_ID"
```

Проект Vercel `shamil` (без суффикса) к стенду не относится — не удалять.

## Чем стенд отличается от будущего боевого сайта

| | Стенд | Боевой сайт |
| --- | --- | --- |
| Хостинг и БД | Vercel + Neon, Франкфурт | Хостинг в РФ: персональные данные донатеров по 152-ФЗ хранятся в РФ |
| Оплата | Эмулятор Robokassa, деньги не списываются | Настоящая Robokassa: `PAYMENT_IS_TEST=false`, боевые пароли, `PAYMENT_ROBOKASSA_URL` по умолчанию, `PAYMENT_EMULATOR_ENABLED=false` |
| Стадия | `DEPLOY_STAGE=demo` | `DEPLOY_STAGE=production` (или не задана) — валидация не даст поднять эмулятор |
| Данные | Только тестовые, имена и телефоны вымышленные | Настоящие ПДн |
| Индексация | `noindex` | Индексируется, свой домен mechetshamil.ru |
