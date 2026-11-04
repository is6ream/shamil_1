# Вход в кабинет через VK ID

Второй способ входа в кабинет жертвователя (первый — код на почту). Сделано 27.10.2026 по
официальной документации VK ID (id.vk.ru), **без SDK**: обычный OAuth 2.1 с PKCE, обмен кода
на бэкенде. Токены VK мы не храним — после входа нам нужен только `user_id`.

## Что настроить в кабинете VK ID (id.vk.ru → «Приложения»)

1. Создать приложение типа **«Веб»**. Платформа — сайт, домен `mechetshamil.ru`.
2. Доверенный **Redirect URL** — ровно:
   `https://api.mechetshamil.ru/api/donor/auth/vk/callback`
   (формула: `${PUBLIC_API_URL}/api/donor/auth/vk/callback`). VK сравнивает строку целиком:
   другой протокол, слэш в конце или поддомен — и вход не сработает. Для локальной проверки
   добавить отдельно `http://localhost:3201/api/donor/auth/vk/callback`.
3. Доступы: достаточно базового `vkid.personal_info` (имя, фамилия, id). Почту и телефон
   не запрашиваем: почта из VK логином не становится (её никто не подтверждал у нас).
4. Из раздела приложения взять **ID приложения** и **сервисный ключ доступа**.

## Переменные окружения (API)

| Переменная | Что это |
| --- | --- |
| `VK_ID_CLIENT_ID` | ID приложения VK ID (только цифры) |
| `VK_ID_SERVICE_TOKEN` | Сервисный ключ приложения. **Секрет**: только в окружении API, не в репозитории |
| `PUBLIC_API_URL` | Уже есть; из него строится redirect URL |

Задаются только вместе — API не стартует, если указана одна из двух. Без них кнопка «Войти
через VK» на сайте не показывается (`GET /donor/auth/methods` → `vk: false`).

## Как устроен вход

1. Сайт: `POST /donor/auth/vk/start { pdConsent: true, returnTo }` (fetch с `credentials`).
   API создаёт `state` (32 случайных байта) и `code_verifier` (PKCE S256), хеш `state` и
   verifier кладёт в `donor_oauth_state` на 10 минут, а сам `state` — в httpOnly cookie
   `shamil_vk_state` (`SameSite=Lax`, путь `/api/donor/auth/vk`). Отвечает адресом
   `https://id.vk.ru/authorize?response_type=code&client_id&redirect_uri&state&code_challenge&code_challenge_method=S256`.
2. Человек подтверждает вход на id.vk.ru, VK ведёт браузер на redirect URL с `code`, `state`,
   `device_id`.
3. `GET /donor/auth/vk/callback`: `state` из адреса должен совпасть с cookie и с записью
   в БД; запись одноразовая. Обмен — `POST https://id.vk.ru/oauth2/auth`
   (`grant_type=authorization_code`, `code_verifier`, `device_id`, `state`, `service_token`),
   VK обязан вернуть тот же `state`. Затем `POST https://id.vk.ru/oauth2/user_info` → `user_id`.
4. Нашли кабинет с этим `vk_user_id` — вход; нет — новый кабинет без почты. Refresh-cookie
   ставится, браузер уходит `302` на `returnTo` (только относительный путь сайта).

Страница колбэка — только `302`, без тела и скриптов, `Referrer-Policy: no-referrer`:
документация VK требует, чтобы код не утёк через Referer.

## Ошибки и `?vk=`

Любая неудача колбэка ведёт на `/profile?vk=error` (окно входа объясняет, что случилось).
`?vk=taken` — VK уже привязан к другому кабинету; `?vk=linked` — привязка из «Настроек» прошла.

## Привязка и отвязка

- «Настройки» → «Привязать VK»: `POST /donor/auth/vk/link` (под Bearer), дальше тот же путь.
- «Отвязать»: `DELETE /donor/me/vk`. Если почты нет — `409`: войти будет нечем.
- Удаление аккаунта без почты подтверждается **свежим входом через VK** (не старше 10 минут).
