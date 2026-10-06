# Кнопки, навигация, закрытие, хаптика

Источники: core.telegram.org/bots/webapps (BottomButton, BackButton,
SettingsButton, HapticFeedback, методы закрытия и свайпов), документация и
типы @tma.js/sdk 3.3.0. Хуки — `assets/hooks.ts`, проверены в React 19
StrictMode через подмену окружения.

## Нижние кнопки (BottomButton)

С Bot API 7.10 класс MainButton переименован в BottomButton, и у него два
экземпляра: главная и вторичная. Рисует их Telegram — **в DOM их нет**, и
видимая область мини-аппа над ними уменьшается.

| | `mainButton` | `secondaryButton` |
| --- | --- | --- |
| С версии | всегда | 7.10 (`isSupported()`) |
| Текст по умолчанию | «Continue» | «Cancel» |
| Цвет по умолчанию | `button_color` / `button_text_color` | `bottom_bar_bg_color` / `button_color` |
| Где стоит | — | `position`: `left` (по умолчанию), `right`, `top`, `bottom`; учитывается, только когда видны обе |

`setParams` у @tma.js/sdk принимает camelCase: `text`, `isVisible`,
`isEnabled`, `isLoaderVisible`, `bgColor`, `textColor`, `hasShineEffect`,
`iconCustomEmojiId` (эмодзи перед текстом — Bot API 9.5+), у вторичной ещё
`position`. Монтировать после `themeParams` (у вторичной — и после `miniApp`):
цвета по умолчанию берутся оттуда.

### Главная кнопка как конечный автомат

| Состояние | `isEnabled` | `isLoaderVisible` | Когда |
| --- | --- | --- | --- |
| idle | `true` | `false` | можно отправлять |
| submitting | `false` | `true` | запрос в пути; повторное нажатие невозможно |
| blocked | `false` | `false` | форма не готова |

- Текст задаётся **всегда**, по-русски: иначе клиент покажет «Continue».
- В blocked человек не узнаёт причину от кнопки — причина пишется текстом на
  экране рядом с полем. Альтернатива — оставить кнопку активной и показать
  ошибку по нажатию; выбрать одно на всё приложение.
- `showLoader()` у Telegram по умолчанию и так выключает кнопку (в
  telegram-web-app.js — `showProgress(leaveActive)`); в @tma.js/sdk мы держим
  оба флага явно, чтобы состояние читалось из кода.
- При запуске из меню вложений главная кнопка скрыта, пока человек не
  взаимодействовал с интерфейсом (документация `show()`).

```tsx
import { useMainButton } from './telegram/hooks';

function EditGoal() {
  const [state, setState] = useState<SubmitState>('blocked');
  useMainButton('Сохранить', state, async () => {
    setState('submitting');
    try { await save(); } finally { setState('idle'); }
  });
  // …
}
```

### Почему отписка обязательна

`onClick` добавляет обработчик, а не заменяет прежний (в telegram-web-app.js
это прямо `onEvent('mainButtonClicked', …)`). Экран, который смонтировался
дважды (StrictMode, возврат назад), без отписки получит два обработчика —
два сохранения на одно нажатие. В @tma.js/sdk `onClick` **возвращает функцию
отписки** — её и возвращаем из `useEffect`. `ifAvailable()` отдаёт
`{ ok: true, data: отписка } | { ok: false }`.

Проверено: в StrictMode два нажатия заглушки главной кнопки дают ровно два
вызова, не четыре.

## BackButton и роутер

Кнопка «назад» в шапке Telegram (6.1+). Что делает системная «назад» Android
при видимой BackButton — в документации не сказано (yaniv-golan считает, что
то же самое; **не подтверждено** — проверить на устройстве).

- Видна только на вложенных экранах; на корневом скрыта.
- Ведёт **к родителю в иерархии экранов**, а не `history.back()`: мини-апп
  часто открывают прямой ссылкой с `startapp` сразу на вложенный экран, и
  истории до него нет. (Вывод из устройства запуска, не из документации.)
- Хук `useBackButton(onBack | null)` из `assets/hooks.ts`: `null` — скрыть.

```tsx
const navigate = useNavigate();
useBackButton(isRoot ? null : () => navigate(parentPath, { replace: true }));
```

Роутер: параметры запуска Telegram кладёт в `#` адреса. @tma.js/sdk при первом
чтении сохраняет их в `sessionStorage`, поэтому роутер (хоть hash, хоть
history) может хэш перезаписать. Официальный шаблон tma.js использует
`HashRouter`. С `BrowserRouter` хостинг должен отдавать `index.html` на любой
путь — иначе перезагрузка внутри Telegram даст 404.

## SettingsButton

Не шестерёнка в шапке, а **пункт «Настройки» в контекстном меню мини-аппа**
(документация: «Settings item in the context menu»). Bot API 7.0+.
`settingsButton.mount/show/onClick` — как у BackButton.

## Закрытие и свайпы

| Что | @tma.js/sdk | Bot API | Правило |
| --- | --- | --- | --- |
| Подтверждение закрытия | `closingBehavior.enableConfirmation()` / `disableConfirmation()` | 6.2 | включать при первой несохранённой правке, выключать после сохранения или отказа |
| Вертикальные свайпы | `swipeBehavior.disableVertical()` / `enableVertical()` | 7.7 | Telegram рекомендует оставлять включёнными, если они не спорят с жестами приложения |
| Закрыть | `miniApp.close()` | — | после завершённого сценария, не как «назад» |

После `disableVertical()` свернуть и закрыть мини-апп свайпом по шапке всё
равно можно (документация). Отключать — с комментарием в коде, какой свой жест
у верхнего края конфликтует.

## Хаптика

| Метод | Когда |
| --- | --- |
| `hapticFeedback.notificationOccurred('success' \| 'error' \| 'warning')` | итог действия: сохранилось, не сохранилось |
| `hapticFeedback.impactOccurred('light' \| 'medium' \| 'heavy' \| 'rigid' \| 'soft')` | физическое событие: карточка «упала» на место при перетаскивании |
| `hapticFeedback.selectionChanged()` | значение в пикере **сменилось**; документация: не использовать, когда выбор делается или подтверждается |

Правило проекта (не документации): отклик на итог, не на каждое касание —
частая хаптика перестаёт что-либо сообщать. Все вызовы — `ifAvailable`, в
браузере это тишина.

## Ссылки и попапы

- `openLink(url)` — внешний браузер, мини-апп не закрывается; вызывать только
  в ответ на действие человека (документация). `openTelegramLink` — ссылка
  t.me внутри Telegram, с 7.0 мини-апп не закрывается.
- `popup.show({ title, message, buttons })` (6.2+): заголовок 0–64 символа,
  текст 1–256, кнопок 1–3; у `default`/`destructive` текст обязателен, у
  `ok`/`close`/`cancel` его пишет клиент на языке клиента. Промис отдаёт `id`
  нажатой кнопки или `undefined`.
- Нативный попап — для подтверждения разрушительного действия. Всё, что
  длиннее 256 символов или с полями ввода, — своя шторка.
