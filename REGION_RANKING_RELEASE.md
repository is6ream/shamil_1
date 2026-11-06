# Выпуск рейтинга регионов и последних поступлений — 6 ноября 2026

## База и границы

Подтверждённая база: `1ec684e64d7315fca48e689baeed6a0ccd3f89d5`, `origin/production` после fetch.
Timeweb: web 268991 и API 268595, оба успешно запущены на `1ec684e`.
Исходный web deployment: 4 ноября, старт 17:31, Deploy succeeded 17:42:28.
Исходный API deployment: 5 ноября, старт 19:19, Deploy succeeded 19:23:13.
Время выше — как показано панелью, без предположения о часовом поясе.
Оба приложения отслеживают production, `isAutoDeploy` checked.

API: удалён только take, его import/константа и устаревший комментарий. Сохранены regionStats,
where, порядок paidTotalKopecks desc / region.name asc, select, mapper и emptyCount.
Схема, миграции, триггеры, учёт, география, recurring и платёжные настройки не меняются.

Frontend: ReportsSection + RegionRanking и локальные CSS; шесть строк и раскрытие по шесть,
сохранение порядка API, subgrid от 1024px, естественная высота ленты после раскрытия,
Suspense/ошибка/пустой список, фокус первой добавленной строки, локальные гербы.
Интеграция page.tsx ограничена передачей полного Promise списка и исключением slice.
Из showcase.ts удалены только две неиспользуемые константы рейтинга.
Никаких изменений глобальной темы, формы, текстов других блоков и админки.
85 PNG гербов, их карта и sources.txt с авторами/лицензиями включены; ссылка на источники доступна в карточке.

## Проверки

- 209 web-тестов: pass, 0 skipped.
- Web/API ESLint: pass. API typecheck/build: pass.
- Web production build (штатный Turbopack): pass; API для сборки намеренно недоступен локально.
- Web TypeScript 6.0.3 из apps/web: pass. Корневой npx tsc использует API TypeScript 5.9.3
  и выдаёт существующую ошибку Web Locks в неизменённой админке. Команда для web:
  `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`.
- Query-contract unit: 26 строк, прежние фильтры/sort/select/mapper/emptyCount: pass.
- PostgreSQL suite (19 тестов, включая новую регрессию с 26 регионами): SKIPPED.
  TEST_DATABASE_URL проверен на localhost:5434, выделено имя shamil_reports_release_test,
  подключение отказано. Production-БД не использовалась.
- Chrome: 1024, 1280, 1366, 1440, 1920, 768, 390, 375 CSS px.
  getBoundingClientRect: равные исходные карточки и верхние края на desktop,
  вертикальный порядок ниже 1024, отсутствие горизонтального overflow.
  6 → 12 → 18 → 24 → 26, фокус, исчезновение кнопки, 0–6 строк, загрузка/ошибка,
  длинные названия/суммы, гербы, увеличение текста проверены синтетическим HTTP-стендом.
- Собранные ShowcaseController/RegionsService + Nest HTTP + frontend: 26 строк проходят
  сервер и главную. Prisma подменён синтетическими данными; это НЕ проверка PostgreSQL.
- Артефакты находятся в output/playwright/reports-release-2026-11-06/, в Git не включаются.

## Деплой и откат

Web: Next.js, Node 22, /apps/web, npm run build / npm start.
API: корневой Dockerfile; существующий startup выполняет prisma migrate deploy.
Набор миграций идентичен опубликованной базе, новых нет. RUN_SEED=false проверен в панели.
Ручные миграции и seed не запускались. Инфраструктура и переменные не менялись.

Откат каждого приложения: вкладка «Деплой», выбрать успешный `1ec684e`,
«Выполнить откат к коммиту», дождаться Deploy succeeded и проверить health/главную.
Если потребуется вернуть и ветку, создать обратный коммит только этого выпуска
поверх актуальной production без force/reset; учитывать включённый автодеплой.

## Публикация

Итоговый SHA, статусы deployments и production smoke фиксируются после завершения
в отчёте чата. Успешный push не считается подтверждением deployment.
