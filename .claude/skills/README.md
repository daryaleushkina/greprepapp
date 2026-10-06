# Навыки, лежащие в проекте

Перенесены 03.10.2026: здесь тоже будут мини-апп Telegram (веб: React + Vite
внутри WebView) и позже мобильное приложение. Всё веб- и Telegram-ское — из
LifeCommit как есть, `animate-expo` и `react-native-skills` под мобилку — из
audioguide.

**Навык — справочник, а не начальник.** Его текст попадает в контекст вместе с
задачей, и указания внутри исполняются как советы. Когда у проекта появятся
свои документ дизайна и токены, источником правды станут они: навык,
предлагающий цвет, гарнитуру, отступ или длительность мимо токенов, ошибся — не
мы.

| Навык                          | Когда                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| `grilling`, `grill-me`         | допрос перед новой задачей; `grill-me` — ручной вызов того же         |
| `telegram-mini-app`            | всё, что касается Telegram: SDK @tma.js, тема, safe area, кнопки, initData, мок вне Telegram |
| `impeccable`                   | устройство экрана, иерархия, аудит интерфейса; есть разделы под iOS и Android |
| `apple-design`                 | жесты, шторки, пружинная физика, материалы                            |
| `emil-design-eng`              | отделка деталей, решения по анимациям                                 |
| `ui-ux-pro-max`                | проверочные списки: доступность, цели нажатия, формы                  |
| `mobile-native`                | чтобы веб в WebView ощущался нативным: 100vh, safe area, зум полей, подсветка нажатия |
| `animate`                      | построить анимацию с нуля (веб)                                       |
| `animate-expo`                 | то же для мобильного приложения: Reanimated, Gesture Handler, Expo Router, хаптика |
| `react-native-skills`          | производительность React Native и Expo: списки, анимации, жесты, навигация, состояние |
| `review-animations`            | разбор конкретной анимации                                            |
| `improve-animations`           | аудит движения по всему коду, план правок                             |
| `find-animation-opportunities` | где анимации не хватает                                               |
| `animation-vocabulary`         | как называется эффект                                                 |
| `prototype`                    | несколько вариантов элемента с переключателем, только ручной вызов    |
| `better-ui`, `better-layout`, `better-typography`, `better-colors`, `better-accessibility`, `better-writing` | отделка по темам: радиусы и зоны нажатия, раскладка, шрифт, цвет и контраст, доступность, тексты |
| `better-interface`             | все `better-*` одним проходом                                         |
| `interface-review`             | подробный разбор готового экрана, только ручной вызов                 |
| `break`                        | компонент во всех состояниях на временной странице, ручной вызов      |
| `variant`                      | варианты компонента по одной оси, ручной вызов; ближе к коду, чем `prototype` |
| `explain-interface`            | как сделан понравившийся чужой интерфейс, ручной вызов                |
| `ui-verification`              | проверка в браузере: axe в обеих темах, зоны нажатия, 320px, ошибки и пустые ответы API |

Вместе с `impeccable` перенесены его агенты — `.claude/agents/impeccable-*`.
Какие скиллы подключаются сами, без просьбы, — `CLAUDE.md`, «Скиллы подключаются
сами».

## Чего здесь нет

- **Своего ревью и проверок LifeCommit** — агенты `lc-*`, команды `/lc-review`,
  `/lc-explore`, `/click-path-audit`, хуки `block-no-verify` и `protect-gates`.
  Они написаны под его код (Worker, Supabase, e2e, хук pre-push); здесь их
  делать заново, когда появятся код и проверки.

## MCP проекта (`.mcp.json`)

- **`chrome-devtools`** — трейсы производительности на замедленном процессоре,
  консоль, сеть, эмуляция экрана, Lighthouse. Запускается с `--isolated`
  (временный профиль, твой Chrome не трогается), экран 390×844, без отправки
  адресов в CrUX и без статистики Google. Версия закреплена, Node 22 через
  `fnm exec`: пакету нужен Node ≥ 20.19, а по умолчанию стоит 20.9.
- **`lazyweb`** — референсы: экраны и сценарии реальных приложений. Вход по
  OAuth: `/mcp` → lazyweb → почта и шестизначный код. Бесплатно, но отчёты
  урезаны; полные — на платном тарифе. Скрипт `install.sh` с их сайта не
  запускаем: он ставит навыки глобально в `~/.claude/skills`.

## Чего делать нельзя

- **`ui-ux-pro-max --persist`.** Он пишет `design-system/<проект>/MASTER.md` и
  называет его «Global Source of Truth» — второй источник правды на диске
  однажды разойдётся с документом дизайна.
- **`/impeccable document` без оговорки.** Он пишет `DESIGN.md` в корень. Если
  документ дизайна будет жить в `docs/`, получится дубль.

## Грабли

- **`impeccable` ставится и обновляется только установщиком**, а не
  копированием папки: `npx impeccable install --providers=claude --project --yes --force`
  (сам `npx` — на Node 22: `eval "$(fnm env --shell bash)" && fnm use 22`).
  Установщик кладёт скилл, агентов в `.claude/agents/impeccable-*` и хуки в
  `.claude/settings.local.json`. С версии 4.2 проверки делает скачанный
  бинарник `scripts/bin/<платформа>/impeccable`, Node ему не нужен.
- **Сюда `impeccable` скопирован папкой** — та же версия, что в LifeCommit.
  Хук детектора в git не ездит (`settings.local.json`), поэтому на Маке его
  нужно включить один раз: `/impeccable hooks on`. Следующее обновление — уже
  установщиком.
- **Бинарник `impeccable` в git не кладётся** (12 МБ, под одну платформу):
  в `.gitignore` строка `.claude/skills/impeccable/scripts/bin/`, лаунчер
  скачает его сам при первом запуске.
- **`telegram-mini-app` перенесён целиком с Мака**, из рабочей папки
  LifeCommit: в его git справочники (`references/sources.md`,
  `buttons-and-navigation.md`, `storage-and-init-data.md`,
  `outside-telegram.md`, `platforms.md`), `LICENSES.md` и `licenses/` не
  попали, а там они лежат — версия от 05.10.2026 (задача #1).
- **`ui-verification` — часть связки с `ui-design` того же автора**, который
  сюда не взят: он пересекается с `impeccable`. Без него навык работает в
  режиме «дали маршруты» — сам решает, какие пробы гонять; ссылки на схему
  находок `ui-design` просто пропускаются.
- **Мобильные навыки предполагают React Native + Expo.** Выберем другой стек
  мобилки — `animate-expo` и `react-native-skills` убрать.
- **`react-native-skills` в audioguide был подогнан под тот проект**: два
  правила (`ui-expo-image`, `list-performance-virtualize`) там удалили как
  дубли его `CLAUDE.md`. Здесь они возвращены из первоисточника, а раздел
  «С оглядкой» в `SKILL.md` переписан без ссылок на код аудиогида.
- **`better-*` написаны под английский текст.** Кириллица, «ёлочки» и
  неразрывные пробелы там не разобраны.
- **Палитры и пары шрифтов `ui-ux-pro-max` кириллицу не учитывают.** Для
  русскоязычного интерфейса шрифт выбирается по разбору кириллицы, а не из
  его базы.
- **Цвета мини-аппа.** `telegram-mini-app` требует брать их только из темы
  Telegram (`themeParams`), и его `check.sh` ругается на hex. Здесь решено
  иначе: свои цвета «Шагов» из токенов (решение Даши 05.10.2026, задача #2) —
  в мини-аппе из темы Telegram берётся только светлая она или тёмная. Готовые
  палитры навыков годятся только для акцента.

## Что откуда взято

| Папка                                                                                                                                                             | Источник                                                | Лицензия   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| `emil-design-eng`, `animate`, `animate-expo`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `apple-design`, `animation-vocabulary`, `prototype`, `mobile-native` | github.com/emilkowalski/skills                          | MIT        |
| `react-native-skills`                                                                                                                                             | github.com/vercel-labs/agent-skills (через audioguide)  | MIT        |
| `impeccable`                                                                                                                                                      | github.com/pbakaus/impeccable, `npx impeccable install` | Apache 2.0 |
| `ui-ux-pro-max`                                                                                                                                                   | github.com/nextlevelbuilder/ui-ux-pro-max-skill         | MIT        |
| `better-*`, `interface-review`, `break`, `variant`, `explain-interface`                                                                                            | github.com/jakubkrehel/skills                           | MIT        |
| `ui-verification`                                                                                                                                                 | github.com/mblode/agent-skills                          | MIT        |
| `telegram-mini-app`                                                                                                                                               | свой; часть правил — по мотивам victorzhuk/skills (Apache 2.0) и yaniv-golan (MIT), подмена — по шаблону tma.js (MIT) | —          |
| `grilling`, `grill-me`                                                                                                                                            | свои                                                    | —          |

Тексты лицензий MIT — в `LICENSES/`; у `react-native-skills` лицензия указана
в шапке его `SKILL.md`.
