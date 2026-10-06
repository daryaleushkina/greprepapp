# initData, параметры запуска и хранилища

Источники: core.telegram.org/bots/webapps (WebAppInitData, валидация,
CloudStorage, DeviceStorage, SecureStorage), docs.telegram-mini-apps.com
(authorizing-user, init-data-node/validating), типы и исходник @tma.js/sdk 3.3.0.

## Параметры запуска

Telegram передаёт их в хэше адреса: `#tgWebAppData=…&tgWebAppVersion=…&tgWebAppPlatform=…&tgWebAppThemeParams=…`.
`retrieveLaunchParams()` ищет их по очереди в `location.href`, в
`performance` (адрес первой навигации) и в `sessionStorage`, и при первом
успехе сохраняет туда. Поэтому **руками `location.hash` не читать**: после
первой навигации роутера параметров там уже нет, а перезагрузка страницы
внутри Telegram их обратно не вернёт.

`start_param` — значение `startapp` из прямой ссылки
(`t.me/<бот>/<приложение>?startapp=…`) или ссылки главного мини-аппа
(`t.me/<бот>?startapp=…`). Приходит и в initData, и отдельным
`tgWebAppStartParam`. По docs.telegram-mini-apps.com — только `A-Za-z0-9_-`,
до 512 символов (в документации Telegram длина не указана).

## initData

- `initData.restore()` после `init()` — иначе сигналы пустые.
- `initData.user()`, `chat()`, `receiver()` отдают объекты с snake_case-ключами,
  как в самих данных (`first_name`, `language_code`, `photo_url`).
- `user.id` — до 52 значащих бит: в JS `number` безопасен, в Postgres —
  `bigint`, не `integer`.
- **Пустая initData** — при запуске с reply-клавиатуры (`web_app`
  KeyboardButton) и из инлайн-режима (документация). Такой вход авторизовать
  нечем.

### Что уходит на сервер

```ts
import { retrieveRawInitData } from '@tma.js/sdk-react';

const raw = retrieveRawInitData(); // ровно та строка, которую подписал Telegram
await fetch('/api/goals', { headers: { Authorization: `tma ${raw}` } });
```

`tma <строка>` — соглашение tma.js, Telegram формат передачи не задаёт.
Строку не пересобирать и не сортировать: подпись считается по исходной.

Сервер:

- проверяет HMAC-SHA256 (ключ — HMAC от токена бота с константой
  `WebAppData`) и срок `auth_date`. Пакет `@tma.js/init-data-node`:
  `validate(raw, botToken)` бросает на неверной подписи и по умолчанию
  отвергает данные старше суток (`expiresIn`, 86 400 с). Для сред с Web Crypto
  (Cloudflare Workers, Deno) — импорт из `@tma.js/init-data-node/web`, там
  функции асинхронные.
- Ed25519-проверка по полю `signature` (Bot API 8.0+, `validate3rd`) — для
  третьих сторон без токена бота. Своему серверу она не нужна.
- Права решает только по проверенным данным. `initData.user()` на клиенте —
  для приветствия, не для «можно ли».

## Хранилища

| | CloudStorage | DeviceStorage | SecureStorage |
| --- | --- | --- | --- |
| Bot API | 6.9 | 9.0 | 9.0 |
| Где | серверы Telegram, на всех устройствах человека | это устройство | Keychain (iOS) / Keystore (Android) |
| Лимит | 1024 ключа; ключ 1–128 символов `A-Za-z0-9_-`; значение 0–4096 символов | 5 МБ на бота и человека | 10 значений |
| @tma.js/sdk | `cloudStorage.getItem/getItems/setItem/deleteItem/getKeys/clear` | `deviceStorage.getItem/setItem/deleteItem/clear` | `secureStorage.getItem/setItem/deleteItem/restoreItem/clear` |
| Монтирование | не нужно | не нужно | не нужно |

Грабли:

- **`cloudStorage.getItem` для отсутствующего ключа отдаёт `''`** (исходник
  3.3.0 дополняет ответ пустыми строками). Хранить «пустое» как значение —
  значит не отличить его от «нет ключа». Храним JSON, отсутствие — `''`.
- `deviceStorage.getItem` отдаёт `null` для отсутствующего; `setItem(key, null)`
  удаляет ключ.
- `secureStorage.getItem` отдаёт `{ value, canRestore }`: если `value === null`
  и `canRestore` — значение было на этом устройстве, и `restoreItem` спросит
  человека, вернуть ли его.
- Все методы асинхронные и идут через клиент — не звать в цикле по ключу,
  брать `getItems([...])`.
- Каждый вызов — через `isAvailable()`: на клиенте ниже 9.0 DeviceStorage нет,
  и нужен запасной путь (обычно — сервер или `localStorage`).

Что куда:

- Данные приложения (цели, записи) — **на сервер**. Хранилища Telegram — не
  база: лимиты малы, выгрузить и мигрировать нельзя.
- CloudStorage — настройки, которые должны переехать на другое устройство.
- DeviceStorage — черновики и кэш этого устройства.
- SecureStorage — токен сессии, если он появится. Не initData: она и так
  приходит при каждом запуске.
- `localStorage` внутри WebView работает, но поведение по лимитам и очистке
  на разных клиентах не подтверждено — для важного не опора.
