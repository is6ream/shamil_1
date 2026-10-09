# API админ-панели mechetshamil.ru

Контракт бэкенда для фронтенда (промпт 2/2). Сверено с кодом `apps/api` 09.10.2026: список маршрутов
снят с роутера работающего приложения, формы ответов — из response-типов сервисов, поведение
закреплено e2e `apps/api/src/e2e/admin.e2e.spec.ts`. Расхождение с кодом — ошибка этого документа.

- База: `https://api.mechetshamil.ru/api` (локально `http://localhost:3001/api`). Все пути ниже — от `/api`.
- Тела запросов и ответов — JSON (`Content-Type: application/json`), кроме загрузки файла (multipart) и CSV.
- **Деньги — всегда строкой из цифр, в копейках**: `"24000000000"` = 240 000 000 ₽. Ни в запросах, ни в
  ответах денег-чисел нет. Числами идут только счётчики (`count`, `donationsCount`, `invoiceNo`).
- Время — ISO-8601 UTC (`2026-10-08T09:00:00.000Z`). Даты без времени — `ГГГГ-ММ-ДД`.
- Лишнее поле в теле или query — **400** (`forbidNonWhitelisted`). Отправляйте только описанные поля.

## Содержание

1. [Сессия](#1-сессия) · 2. [Ошибки](#2-ошибки) · 3. [Роли](#3-роли-d-06) · 4. [Auth](#4-auth) ·
5. [Пользователи](#5-пользователи) · 6. [Журнал](#6-журнал-действий) · 7. [Медиатека](#7-медиатека) ·
8. [Галерея](#8-галерея) · 9. [Видео](#9-видео) · 10. [Контент](#10-контент-главной) ·
11. [Этапы](#11-этапы-стройки) · 12. [Новости](#12-новости) · 13. [Пожертвования](#13-пожертвования) ·
14. [Сбор и цели](#14-сбор-и-цели) · 15. [Дашборд](#15-дашборд) · 16. [Публичные чтения](#16-публичные-чтения-сайт) ·
17. [Ревалидация](#17-ревалидация-сайта) · 18. [Health](#18-health) · 19. [Лимиты](#19-лимиты)

---

## 1. Сессия

```
login (email+пароль) ──► { accessToken } в теле  +  Set-Cookie: shamil_admin_rt (httpOnly)
        │
        ├─ access держим В ПАМЯТИ вкладки (не localStorage/sessionStorage), шлём Authorization: Bearer <access>
        │
        ├─ 401 на любом запросе ──► POST /admin/auth/refresh (cookie уходит сама, credentials: 'include')
        │        ├─ 200 → новый access, повторить исходный запрос ОДИН раз
        │        └─ 401 → на экран входа
        │
        └─ при загрузке страницы access нет ──► сразу refresh (cookie живёт 14 дней)
```

- Access-JWT живёт **15 минут** (`expiresIn: 900` в ответе). Можно обновлять заранее, за минуту до конца.
- Refresh-токен — только в cookie `shamil_admin_rt`: `HttpOnly; SameSite=Strict; Path=/api/admin/auth`,
  `Secure` в production. JS его не видит и не должен. Cookie уходит **только** на `/api/admin/auth/*`.
- Все запросы к `/admin/auth/*` — с `credentials: 'include'` (иначе браузер не отправит и не сохранит cookie).
  Остальным админским запросам cookie не нужна — им нужен Bearer.
- **Ротация:** каждый `refresh` выдаёт новую cookie, старая гаснет. **Повторное предъявление уже
  использованной cookie отзывает все сессии этой цепочки** (защита от кражи). Поэтому:
  - **refresh строго по одному за раз** на вкладку: держите один промис обновления, остальные запросы ждут его;
  - между вкладками — синхронизируйте (например, `BroadcastChannel` или `navigator.locks.request('refresh', …)`),
    иначе две вкладки, одновременно обновляющие сессию, разлогинят друг друга.
- Смена пароля, смена роли или деактивация пользователя гасят его access-токены **сразу** (не через 15 минут),
  и все refresh-cookie. После `PATCH /admin/auth/password` текущая вкладка получает новую сессию в ответе.
- Сайт и API — same-site (`mechetshamil.ru` / `api.mechetshamil.ru`), поэтому `SameSite=Strict` работает.
  Origin сайта должен быть в `CORS_ORIGINS` API (там же `credentials: true`).

## 2. Ошибки

Формат тела — стандартный NestJS:

```json
{ "statusCode": 400, "message": "Пароль — не короче 12 символов", "error": "Bad Request" }
```

Ошибка валидации DTO — `message` массивом строк:

```json
{ "statusCode": 400, "message": ["amountKopecks — положительное целое число копеек строкой"], "error": "Bad Request" }
```

| Код | Когда | Что делать фронту |
| --- | --- | --- |
| 400 | Невалидное тело/query, бизнес-правило (пароль слабый, дата в будущем, HTML в новости) | Показать `message` |
| 401 | Нет/истёк/чужой access; на `login` — неверная пара | `refresh` → повтор; на `login` — «Неверный e-mail или пароль» |
| 403 | Роль не допускает действие | Скрыть/заблокировать действие по роли из `me` |
| 404 | Нет сущности | — |
| 409 | Конфликт: дубль e-mail/slug, файл используется, пересечение периодов, ключ идемпотентности с другими данными, последний суперадмин | Показать `message` |
| 413 | Файл больше лимита | «Файл больше N МБ» |
| 429 | Лимит запросов (вход: 5/мин с IP) | «Слишком много попыток, подождите минуту» |
| 503 | `/health/ready`: зависимость недоступна | — |

Особые тела:
- `DELETE /admin/media/:id` → 409:
  `{ "message": "Файл используется — сначала уберите его из этих мест", "usages": [{ "entityType": "gallery_item", "entityId": "…", "label": "Фундамент" }] }`.
  `entityType`: `gallery_item` | `video_link` | `construction_stage` | `news_post` | `content_block` (`entityId` = ключ блока).

Логин: **один и тот же 401 «Неверный e-mail или пароль»** для несуществующего адреса, неверного пароля,
заблокированного входа (5 неудач → 15 минут) и деактивированного пользователя. Отдельного сообщения про
блокировку нет намеренно.

## 3. Роли (D-06)

`GET /admin/auth/me` → `role`: `SUPER_ADMIN` | `EDITOR` | `ACCOUNTANT`. Меню и кнопки — по этой матрице;
сервер проверяет её сам (403).

| Раздел / действие | SUPER_ADMIN | EDITOR | ACCOUNTANT |
| --- | --- | --- | --- |
| Контент hero/about/contacts/faq, этапы, новости, медиатека, галерея, видео | да | да | нет |
| Реквизиты счёта `PUT /admin/content/requisites` (D-17) | да | **нет** | нет |
| Цель сбора и цели месяца (запись) | да | да | нет |
| `GET /admin/campaign` (чтение) | да | да | да |
| Ручное поступление, подтверждение перевода | да | да | да |
| Список пожертвований, карточка, дашборд | да | да | да |
| ПДн жертвователей (имя для сверки, телефон) | да | маска `•••` | да |
| Экспорт CSV | да | нет | да |
| Журнал действий | да | нет | да |
| Пользователи админки | да | нет | нет |
| Свой профиль, смена своего пароля | да | да | да |

## 4. Auth

Без Bearer: `login`, `refresh`, `logout`. С Bearer: `me`, `password`.

### `POST /admin/auth/login`

Тело: `{ "email": "owner@mechetshamil.ru", "password": "…" }`. Лимит: 5 запросов в минуту с IP.

200 (+ `Set-Cookie: shamil_admin_rt=…`):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": { "id": "5b0f…", "email": "owner@mechetshamil.ru", "role": "SUPER_ADMIN", "displayName": "Суперадмин" }
}
```

401 — неверная пара (см. §2), 400 — e-mail не по формату, 429 — лимит.

### `POST /admin/auth/refresh`

Тела нет, нужна cookie. 200 — тот же ответ, что у `login`, и новая cookie. 401 — cookie нет, она истекла,
отозвана или уже использована (тогда отозвана вся цепочка); cookie при этом очищается. Лимит 20/мин.

### `POST /admin/auth/logout`

Тела нет. **204** всегда (даже без cookie). Гасит цепочку сессий cookie и очищает её. Access-токен в памяти
фронт выбрасывает сам.

### `GET /admin/auth/me` — Bearer

200: `{ "id", "email", "role", "displayName" }` — как `user` в ответе login.

### `PATCH /admin/auth/password` — Bearer

Тело: `{ "currentPassword": "…", "newPassword": "…" }`. Новый пароль: **от 12 символов, не длиннее 72 байт**
(кириллица — 2 байта на букву; bcrypt), не равен текущему.
200 — новая сессия, как у `login` (+ новая cookie); все прочие сессии пользователя погашены.
400 — «Текущий пароль указан неверно» / слабый пароль. Лимит 5/мин.

## 5. Пользователи

Только `SUPER_ADMIN`.

```ts
interface AdminUser {
  id: string; email: string; role: 'SUPER_ADMIN' | 'EDITOR' | 'ACCOUNTANT';
  displayName: string | null; isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;   // вход заблокирован до этого момента после 5 неудач
  createdAt: string;
}
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `GET /admin/users` | — | `AdminUser[]` по дате создания |
| `POST /admin/users` | `{ email, password, role, displayName? }` | 201 `AdminUser`; 409 — e-mail занят |
| `PATCH /admin/users/:id` | `{ role?, displayName? (null — стереть), isActive? }` | 200 `AdminUser` |
| `POST /admin/users/:id/reset-password` | `{ newPassword }` | 204; снимает блокировку входа, гасит сессии |

Правила: свою роль и активность менять нельзя (400). Последнего активного суперадмина нельзя понизить или
отключить (409). Смена роли и деактивация гасят все сессии пользователя сразу.

## 6. Журнал действий

`GET /admin/audit` — `SUPER_ADMIN`, `ACCOUNTANT`.

Query: `page` (1…), `pageSize` (1…100, по умолчанию 25), `actorId` (uuid), `action` (точно `donation.confirm`
или префикс `donation.*`), `entityType`, `entityId`, `from`, `to` (ISO, `to` не включительно).

```json
{
  "items": [{
    "id": "…", "occurredAt": "2026-10-08T09:00:00.000Z",
    "actor": { "type": "user", "id": "…", "role": "EDITOR", "label": "editor@mechetshamil.ru" },
    "action": "stage.update", "entityType": "construction_stage", "entityId": "…",
    "before": { "status": "current" }, "after": { "status": "done" },
    "ip": "93.0.0.1", "userAgent": "Mozilla/5.0 …"
  }],
  "total": 1, "page": 1, "pageSize": 25
}
```

- `actor.type`: `user` | `system`. Системные: `ADMIN_API_TOKEN` (подтверждение скриптом), `webhook:robokassa`
  (расхождение суммы, D-03).
- `before`/`after` — только изменившиеся поля; при создании `before = null`, при удалении `after = null`.
  ПДн и секреты — `"[скрыто]"`. Деньги — строками.
- Действия: `auth.login`, `auth.password_change`, `admin_user.create|update|reset_password`, `media.upload|update|delete`,
  `gallery.create|update|delete|reorder`, `video.create|update|delete|reorder`, `content.update` (entityId = ключ блока),
  `stage.create|update|delete|reorder`, `news.create|update|publish|unpublish|delete`, `donation.confirm`,
  `donation.manual_create`, `donation.export`, `donation.amount_mismatch`, `campaign.update_goal`,
  `campaign.monthly_goal_create|update|delete`.

Общая форма постраничных ответов во всех списках: `{ items, total, page, pageSize }`.

## 7. Медиатека

`SUPER_ADMIN`, `EDITOR`. Все картинки сайта (галерея, обложки, рендер, фото этапов) — только отсюда.

```ts
interface MediaAsset {
  id: string;
  url: string;                                  // = urls.lg
  urls: { sm: string; md: string; lg: string }; // WebP 480 / 1024 / 1920 px по ширине (без увеличения)
  width: number; height: number;                // размеры lg
  bytes: number;                                // сумма трёх вариантов
  altText: string | null; originalName: string | null; createdAt: string;
}
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `POST /admin/media` | **multipart/form-data**: `file` (обязательно), `altText` (необязательно, ≤300) | 201 `MediaAsset` |
| `GET /admin/media?page&pageSize` | — | `{ items: MediaAsset[], total, page, pageSize }`, новые сверху |
| `GET /admin/media/:id` | — | `MediaAsset & { usages: Usage[] }` — где используется |
| `PATCH /admin/media/:id` | `{ altText: string \| null }` | 200 `MediaAsset` |
| `DELETE /admin/media/:id` | — | 204; **409 с `usages`**, если файл где-то стоит |

Загрузка:
- Лимит — `MEDIA_MAX_UPLOAD_MB` (по умолчанию **15 МБ**), сверх — **413**. Один файл на запрос.
- Форматы — **JPEG, PNG, WebP** по содержимому файла (расширение и `Content-Type` не важны). Остальное
  (HEIC, GIF, SVG, PDF, «картинка» с подменой) — **400**. Битый или обрезанный файл — 400.
- Сервер пережимает в WebP трёх размеров, **EXIF/GPS вырезаются**, ориентация применяется. Имя файла
  генерирует сервер; исходное имя хранится только в `originalName`.
- Не задавайте `Content-Type` вручную у `fetch` с `FormData` — браузер поставит boundary сам.
- URL картинок: в production — публичный адрес бакета S3 (`S3_PUBLIC_BASE_URL`), локально —
  `http://localhost:3001/media/…`. Для `next/image` нужен этот домен в `remotePatterns` (D-F08).

## 8. Галерея

`SUPER_ADMIN`, `EDITOR`. Ревалидирует тег `gallery`.

```ts
interface AdminGalleryItem {
  id: string; mediaAssetId: string | null;
  image: PublicImage | null;      // null у строк, заведённых до админки
  url: string;                    // = image.url или старый image_url
  caption: string | null; altText: string | null;
  takenOn: string | null;         // 'ГГГГ-ММ-ДД' — на сайте «июнь 2026»
  isPublished: boolean; sortOrder: number; updatedAt: string;
}
interface PublicImage { url: string; urls: { sm: string; md: string; lg: string }; width: number; height: number; alt: string | null }
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `GET /admin/gallery` | — | `AdminGalleryItem[]` по порядку, включая скрытые |
| `POST /admin/gallery` | `{ mediaAssetId, caption?, altText?, takenOn?, isPublished? = true, sortOrder? }` | 201 |
| `PATCH /admin/gallery/:id` | любые поля из POST; `caption/altText/takenOn: null` — стереть | 200 |
| `DELETE /admin/gallery/:id` | — | 204 (файл остаётся в медиатеке) |
| `PUT /admin/gallery/order` | `{ ids: string[] }` — **все** строки галереи ровно по разу | 200 `AdminGalleryItem[]` |

`altText` по умолчанию берётся из медиатеки. Несуществующий `mediaAssetId` — 400.

## 9. Видео

`SUPER_ADMIN`, `EDITOR`. Ревалидирует тег `video`. Видео не хостим — только ссылки (D-13).

Принимаются только `https`-ссылки:
- YouTube: `youtube.com/watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/embed/ID` → embed `https://www.youtube-nocookie.com/embed/ID`;
- Rutube: `rutube.ru/video/<32hex>/` → `https://rutube.ru/play/embed/<id>`;
- VK Видео: `vk.com/video-1_2`, `vkvideo.ru/video-1_2`, `vk.com/video_ext.php?oid=&id=&hash=` → `https://vk.com/video_ext.php?oid=…&id=…[&hash=…]`.
  Для закрытых роликов VK нужен `hash` — берётся из кода встраивания VK.

Остальное — 400 с причиной.

```ts
interface AdminVideo {
  id: string; provider: 'vk' | 'rutube' | 'youtube';
  embedUrl: string;   // в <iframe src>; собран сервером, ему можно доверять
  sourceUrl: string;  // нормализованная ссылка на ролик
  title: string | null; poster: PublicImage | null; posterMediaId: string | null;
  isPublished: boolean; sortOrder: number; updatedAt: string;
}
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `GET /admin/videos` | — | `AdminVideo[]` |
| `POST /admin/videos` | `{ url, title?, posterMediaId?, isPublished? = true, sortOrder? }` | 201 |
| `PATCH /admin/videos/:id` | любые поля из POST | 200 |
| `DELETE /admin/videos/:id` | — | 204 |
| `PUT /admin/videos/order` | `{ ids }` — все видео | 200 `AdminVideo[]` |

## 10. Контент главной

Блоки `hero`, `about`, `requisites`, `contacts`, `faq`. Поля названы как константы во фронте
(`lib/content.ts`, `lib/organization.ts`), чтобы заменить хардкод без переделки компонентов.
Ревалидирует тег `content`. **Хадисов, слогана и юридических реквизитов организации здесь нет и не будет (D-10):**
`HADITH_BAND`, `SHARE.quote`, наименование/ИНН/ОГРН/юр. адрес и оферта остаются в коде фронта.

Блок **заменяется целиком**: `PUT` отдельного маршрута на каждый ключ, тело — полный блок. Любое лишнее поле — 400.

| Метод, путь | Роли | Тело |
| --- | --- | --- |
| `GET /admin/content` | SA, EDITOR | — → `AdminBlock[]` (есть только заполненные) |
| `GET /admin/content/:key` | SA, EDITOR | — → `AdminBlock`; неизвестный ключ — 404 |
| `PUT /admin/content/hero` | SA, EDITOR | `HeroBlock` |
| `PUT /admin/content/about` | SA, EDITOR | `AboutBlock` |
| `PUT /admin/content/requisites` | **только SA** | `RequisitesBlock` |
| `PUT /admin/content/contacts` | SA, EDITOR | `ContactsBlock` |
| `PUT /admin/content/faq` | SA, EDITOR | `FaqBlock` |

Ответ `PUT` и элемент `GET`: `{ "key": "hero", "data": HeroBlock, "updatedAt": "…", "updatedById": "…" }`.

```ts
interface HeroBlock {
  badge: string;          // 1–80
  title: string;          // 1–160
  lede: string;           // 1–600
  ledeShort: string;      // 1–300, мобильный лид
  trust: string[];        // 1–5 пунктов по 1–80
  renderMediaId: string | null;   // id медиатеки
  renderCaption: string;  // ≤160
  helpButton: string;     // 1–40
}
interface AboutBlock {
  eyebrow: string;        // ≤60
  title: string;          // 1–160
  text: string | null;    // ≤3000; null — абзац не выводится
  facadeMediaId: string | null;
  facadeCaption: string;  // ≤160
  facts: { value: string | null; unit: string | null; label: string | null }[]; // ≤8; value ≤40, unit ≤16, label ≤120
}
interface RequisitesBlock {           // null — «уточняется»
  accountNumber: string | null;       // ровно 20 цифр
  bankName: string | null;            // ≤200
  bik: string | null;                 // 9 цифр
  correspondentAccount: string | null;// 20 цифр
  kpp: string | null;                 // 9 цифр
  sbpQrMediaId: string | null;        // QR СБП из медиатеки
}
interface ContactsBlock {
  phone: string | null;               // цифры, пробелы, ( ) - +; 5–30
  email: string | null;
  telegramChannel: string | null;     // без @, 5–32 [A-Za-z0-9_]
  mosqueAddress: string | null;       // ≤300
}
interface FaqBlock { items: { question: string; answer: string }[] } // ≤50; 1–300 / 1–3000. На сайте пока не выводится (D-11)
```

Строки обрезаются по краям; пустая строка в nullable-поле становится `null`. Тексты — простой текст без HTML
(сайт выводит их как текст). Несуществующий id медиатеки — 400.

## 11. Этапы стройки

`SUPER_ADMIN`, `EDITOR`. Ревалидирует тег `stages`.

```ts
interface AdminStage {
  id: string; title: string;
  status: 'done' | 'current' | 'upcoming';
  amountKopecks: string | null;   // смета (то же, что budgetKopecks) — так её называет фронт
  budgetKopecks: string | null;
  spentKopecks: string | null;    // освоено
  description: string | null;
  photos: PublicImage[]; photoMediaIds: string[];
  sortOrder: number; updatedAt: string;
}
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `GET /admin/stages` | — | `AdminStage[]` по порядку |
| `POST /admin/stages` | `{ title (1–200), description? (≤5000), status? = 'upcoming', budgetKopecks?, spentKopecks?, sortOrder?, photoMediaIds? (≤30) }` | 201 |
| `PATCH /admin/stages/:id` | любые поля; `photoMediaIds` заменяет фото целиком в этом порядке | 200 |
| `DELETE /admin/stages/:id` | — | 204 |
| `PUT /admin/stages/order` | `{ ids }` — все этапы | 200 `AdminStage[]` |

Суммы — копейки строкой `"0"`…, не больше 2,4 млрд ₽ (`"240000000000"`), иначе 400. `null` — не названа.

## 12. Новости

`SUPER_ADMIN`, `EDITOR`. Ревалидирует тег `news`. Публичный адрес — `/novosti/<slug>` (D-12).

```ts
interface AdminNewsPost {
  id: string; slug: string; title: string; excerpt: string | null;
  bodyMarkdown: string; coverMediaId: string | null; cover: PublicImage | null;
  status: 'draft' | 'published'; publishedAt: string | null;
  createdAt: string; updatedAt: string;
}
```

| Метод, путь | Тело / query | Ответ |
| --- | --- | --- |
| `GET /admin/news?status&page&pageSize` | `status`: `draft`/`published` | постранично, по `updatedAt` desc |
| `GET /admin/news/:id` | — | `AdminNewsPost` (для предпросмотра черновика) |
| `POST /admin/news` | `{ title (1–200), slug?, excerpt? (≤500), bodyMarkdown (1–100 000), coverMediaId?, status? = 'draft' }` | 201 |
| `PATCH /admin/news/:id` | любые поля; `status: 'published'` — опубликовать, `'draft'` — снять | 200 |
| `DELETE /admin/news/:id` | — | 204 |

- `slug` — `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤120. Не передан — транслит заголовка (`Залили фундамент` →
  `zalili-fundament`), при совпадении `-2`, `-3`. Явно заданный занятый slug — 409.
- `publishedAt` ставится при публикации; снятие с публикации обнуляет его.
- **Текст — markdown без HTML.** Сервер отклоняет (400): любые `<тег`, `</`, `<!--`, `<?`, autolink в `<…>`;
  ссылки/картинки со схемой кроме `http(s)`, `mailto`, `tel` (`javascript:`, `data:`…). Сайт и предпросмотр
  обязаны рендерить **без raw HTML** (например, `react-markdown` без `rehype-raw`).

## 13. Пожертвования

### `GET /admin/donations` — все роли

Query (все необязательны):

| Параметр | Значение |
| --- | --- |
| `status` | `pending` \| `paid` \| `failed` |
| `from`, `to` | ISO-8601; `to` не включительно |
| `dateField` | `created` (по умолчанию) \| `paid` — к какой дате применять период |
| `method` | `sbp`, `card`, `sberpay`, `tpay`, `bank_transfer`, `cash`… |
| `provider` | `manual` \| `robokassa` |
| `minKopecks`, `maxKopecks` | копейки строкой; сравнивается оплаченная сумма, у неоплаченных — сумма заказа |
| `utmSource`, `utmMedium`, `utmCampaign` | точное совпадение |
| `regionSlug` | `02`, `kz`… |
| `q` | номер счёта или подпись; **SA/ACCOUNTANT** — ещё имя для сверки и телефон (от 4 цифр). У EDITOR поиск по ПДн не работает |
| `sort` | `createdAt` (по умолчанию) \| `paidAt` \| `amount` |
| `order` | `desc` (по умолчанию) \| `asc` |
| `page`, `pageSize` | 1…, 1…100 (25) |

```ts
interface AdminDonation {
  id: string; invoiceNo: number;
  status: 'pending' | 'paid' | 'failed';
  amountKopecks: string;            // сумма заказа
  paidAmountKopecks: string | null; // фактически оплачено (из вебхука/подтверждения)
  currency: string;                 // валюта списания, обычно RUB
  provider: string; method: string | null;
  createdAt: string; paidAt: string | null;
  region: { slug: string; name: string } | null; regionSource: 'link' | 'form' | 'admin' | null;
  isAnonymous: boolean; donorName: string | null;   // публичная подпись
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  referrer: string | null; landingPage: string | null;
  adminComment: string | null;      // у ручных поступлений
  contact: { fullName: string | null; phone: string | null; consentAt: string | null } | null;
  contactMasked: boolean;           // true — у EDITOR вместо значений '•••'
}
```

Ответ — `{ items: AdminDonation[], total, page, pageSize }`. У `EDITOR` заполненные `contact.fullName`
и `contact.phone` приходят как `"•••"` (пустые — `null`), `contactMasked: true` (D-26).

### `GET /admin/donations/:id` — все роли

`AdminDonation & { events: { id, provider, status, amountKopecks, receivedAt, appliedAt }[] }` — история
событий платежа; `appliedAt: null` — событие ничего не изменило (повтор).

### `GET /admin/donations/export.csv` — SUPER_ADMIN, ACCOUNTANT

Те же фильтры, что у списка, без постраничности (`page/pageSize` игнорируются). Ответ — файл
`donations-ГГГГ-ММ-ДД.csv`, `text/csv; charset=utf-8`, UTF-8 **с BOM**, разделитель `;`, CRLF.
Колонки: Номер счёта; Создан (Уфа); Оплачен (Уфа); Статус; Сумма заказа, ₽; Оплачено, ₽; Провайдер; Способ;
Регион; Анонимно; Подпись; Имя для сверки; Телефон; utm_source…utm_term; Комментарий; ID.
Время — по Уфе `ГГГГ-ММ-ДД ЧЧ:ММ:СС`, суммы — рубли с запятой (`1234,56`). Значения, начинающиеся с
`= + - @`, предваряются `'` (телефон выглядит как `'+7999…`). Скачивание — `fetch` с Bearer → `blob()` →
ссылка `URL.createObjectURL` (обычная ссылка `<a href>` Bearer не отправит). EDITOR — 403.

### `POST /admin/donations/manual` — все роли

Ручное поступление (наличные, перевод без заказа на сайте). Донат сразу `paid`, сумма сбора, рейтинг
региона и цель месяца пересчитываются сразу.

```json
{
  "idempotencyKey": "6c1d2f9e-…",   // uuid, генерируется ОДИН раз при открытии формы
  "amountKopecks": "250000",         // > 0, не больше "24000000000" (240 млн ₽)
  "method": "cash",                  // bank_transfer | sbp | cash
  "comment": "Наличные после джума-намаза",   // 3–500, обязательно; БЕЗ ПДн — подсказка в форме
  "paidAt": "2026-10-08T09:00:00.000Z",       // необязательно, по умолчанию сейчас; не в будущем
  "regionSlug": "02",                // необязательно
  "isAnonymous": true,               // по умолчанию true
  "donorName": null                  // только при isAnonymous: false, ≤120
}
```

201: `{ "orderId": "…", "invoiceNo": 1042, "status": "paid", "paidAmountKopecks": "250000", "paidAt": "…", "applied": true }`.
Повтор с тем же ключом и теми же суммой/способом — 201 с тем же `orderId` и `applied: false` (второго
зачисления нет). Тот же ключ с другими данными — 409. Подпись у анонимного, будущая дата, лишний ноль — 400.

### `POST /admin/donations/:id/confirm` — все роли или `ADMIN_API_TOKEN` (D-07)

Подтверждение перевода по реквизитам (донат провайдера `manual` в `pending`).
Тело (всё необязательно): `{ "amountKopecks": "10000", "method": "bank_transfer" | "sbp" | "cash" }` — если
фактическая сумма разошлась с заказом. 200:
`{ "orderId", "status": "paid", "paidAmountKopecks", "paidAt", "applied": true }`; повтор — `applied: false`.
Донат агрегатора (robokassa) — 400; нет доната — 404.

## 14. Сбор и цели

Ревалидирует тег `campaign`. Чтение — все роли, запись — SA, EDITOR.

```ts
interface CampaignAdmin {
  id: string; slug: string; title: string; currency: string;
  goalKopecks: string; minDonationKopecks: string;
  collectedKopecks: string; donationsCount: number;
  monthlyGoals: { id: string; periodStart: string; periodEnd: string; goalKopecks: string; collectedKopecks: string }[]; // новые сверху
}
```

| Метод, путь | Тело | Ответ |
| --- | --- | --- |
| `GET /admin/campaign` | — | `CampaignAdmin` |
| `PATCH /admin/campaign` | `{ goalKopecks }` (> 0, ≤ 10 млрд ₽) | `CampaignAdmin` |
| `POST /admin/campaign/monthly-goals` | `{ periodStart, periodEnd, goalKopecks }` — даты `ГГГГ-ММ-ДД` **по Москве**, включительно | 201 цель |
| `PATCH /admin/campaign/monthly-goals/:id` | `{ periodStart?, periodEnd?, goalKopecks? }` | 200 цель |
| `DELETE /admin/campaign/monthly-goals/:id` | — | 204 |

`collectedKopecks` новой (или сдвинутой) цели сразу включает уже оплаченные донаты периода; дальше растёт
триггером. Пересечение периодов — 409, конец раньше начала — 400.

## 15. Дашборд

`GET /admin/dashboard?from&to` — все роли. Период по дате оплаты, по умолчанию последние 30 дней,
не длиннее 366 (иначе 400).

```json
{
  "campaign": { "goalKopecks": "24000000000", "collectedKopecks": "190000", "donationsCount": 4, "lastPaidAt": "…" },
  "monthlyGoal": { "periodStart": "2026-10-01", "periodEnd": "2026-10-31", "goalKopecks": "500000000", "collectedKopecks": "90001" },
  "period": { "from": "…", "to": "…", "totalKopecks": "90001", "count": 3, "averageKopecks": "30000" },
  "byDay": [{ "date": "2026-10-10", "totalKopecks": "40000", "count": 2 }],
  "byUtm": [{ "source": "vk", "medium": null, "campaign": null, "totalKopecks": "40000", "count": 2 }],
  "byMethod": [{ "method": "sbp", "totalKopecks": "40000", "count": 2 }],
  "recent": [{ "id": "…", "invoiceNo": 1042, "paidAt": "…", "paidAmountKopecks": "50001",
               "provider": "manual", "method": "cash", "regionName": "Республика Башкортостан", "donorName": null }]
}
```

`byDay` — дни по Уфе, только дни с поступлениями (пропуски дорисовывает фронт). `byUtm` — топ-50 по сумме,
`null` — без метки. `monthlyGoal: null` — сейчас нет активной цели. `recent` — 10 последних оплаченных, без ПДн.

## 16. Публичные чтения (сайт)

Без авторизации и троттлинга. Существующие `GET /campaign`, `/regions`, `/regions/top`, `/donors/top`,
`/donations/feed` не менялись.

| Путь | Ответ | Тег кеша |
| --- | --- | --- |
| `GET /content` | `{ hero, about, requisites, contacts, faq, updatedAt }` | `content` |
| `GET /construction` | `{ updatedAt: string \| null, stages: PublicStage[] }` | `stages` |
| `GET /news?page&pageSize` | `{ items: { slug, title, excerpt, cover, publishedAt }[], total, page, pageSize }` | `news` |
| `GET /news/:slug` | `{ slug, title, excerpt, cover, publishedAt, bodyMarkdown }`; черновик/нет — 404 | `news` |
| `GET /gallery` | `{ id, url, caption, takenAtLabel, thumbUrl, alt, width, height }[]` | `gallery` |
| `GET /video` | `{ id, provider, embedUrl, sourceUrl, title, poster }[]` (только опубликованные) | `video` |
| `GET /campaign` | без изменений | `campaign` |

- `/content`: каждый блок — `null`, если ещё не заполнен (фронт показывает текущий хардкод как запасной).
  К блокам добавлены готовые ссылки: `hero.renderUrl` + `hero.render: PublicImage | null`,
  `about.facadeUrl` + `about.facade`, `requisites.sbpQrUrl`. Формы совпадают с `HERO`, `ABOUT`, `BANK_DETAILS`
  фронта (+ `ProjectFact.unit` всегда присутствует, `null` если нет).
- `/construction` совместим с `ConstructionTimeline` фронта: `stages[].{ id, title, status, amountKopecks }` +
  новые `spentKopecks`, `description`, `photos: PublicImage[]`. `updatedAt: null`, пока этапов нет.
- `/gallery` — прежняя форма + `thumbUrl` (480 px, `null` у старых строк), `alt`, `width`, `height` (крупный вариант).
- Сид при первом запуске заполняет `/content` и `/construction` ровно тем, что сейчас захардкожено во фронте
  (`HERO`, `ABOUT`, телефон/e-mail из `organization.ts`, `BANK_DETAILS` = все `null`, `FIXTURE_CONSTRUCTION`).

## 17. Ревалидация сайта

После каждой успешной записи API асинхронно (не ждёт, таймаут 5 с, сбой — только `warn` в лог, сохранение
не откатывается) шлёт на фронт — по контракту фронта D-F02:

```
POST ${WEB_REVALIDATE_URL}            (по умолчанию ${PUBLIC_SITE_URL}/api/revalidate)
Authorization: Bearer ${REVALIDATE_SECRET}
Content-Type: application/json

{ "tags": ["content"] }
```

Теги фиксированы: `content`, `stages`, `news`, `gallery`, `video`, `campaign`. Какой раздел шлёт какой тег:

| Запись | Теги |
| --- | --- |
| `PUT /admin/content/*` | `content` |
| этапы | `stages` |
| новости | `news` |
| галерея | `gallery` |
| видео | `video` |
| цель сбора и цели месяца | `campaign` |

Ручное поступление и подтверждение перевода ревалидацию **не** шлют: цифры сбора у фронта и так живут 15 с
(`LIVE_REVALIDATE_S`). Нет `REVALIDATE_SECRET` у API — ревалидация выключена.

## 18. Health

- `GET /health` — живость, без зависимостей: `{ "status": "ok", "uptimeSeconds": 12, "timestamp": "…" }`.
- `GET /health/ready` — готовность: 200 `{ "status": "ok", "checks": { "database": "ok", "storage": "ok" }, "storageDriver": "s3" }`;
  503 с тем же телом и `"status": "fail"` / `"fail"` у упавшей проверки. При `s3` — `HeadBucket`.

## 19. Лимиты

| Что | Лимит |
| --- | --- |
| `POST /admin/auth/login`, `PATCH /admin/auth/password` | 5 запросов / мин с IP |
| `POST /admin/auth/refresh`, `logout` | 20 / мин |
| Остальные `/admin/*` | 300 / мин с IP |
| Блокировка входа | 5 неудач подряд → 15 минут (снимает сброс пароля суперадмином) |
| Access-JWT | 15 минут |
| Refresh-cookie | 14 дней, ротация на каждом обновлении |
| Пароль | 12 символов … 72 байта |
| Загрузка | `MEDIA_MAX_UPLOAD_MB` (15 МБ), JPEG/PNG/WebP, 1 файл |
| Списки | `pageSize` ≤ 100 |
| Дашборд | период ≤ 366 дней |
