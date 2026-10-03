# GrePrepApp — как всё устроено

Кода пока нет: каркас — первая задача (`docs/ROADMAP.md`). Правила работы —
`CLAUDE.md`.

## Что лежит в репозитории

| Путь                                   | Что                                                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| `CLAUDE.md`                            | правила работы                                                      |
| `.claude/skills/`                      | скиллы дизайна, Telegram и мобилки; разбор — `.claude/skills/README.md` |
| `.claude/agents/impeccable-*`          | агенты скилла `impeccable`                                          |
| `.claude/agents/gp-*`, `.claude/commands/`, `.claude/workflows/gp-review.js` | панель ревью `/gp-review`, «злой пользователь» `/gp-explore`, проход по кнопкам `/click-path-audit` — из LifeCommit; работают, когда есть каркас |
| `.claude/hooks/session-git.sh`         | SessionStart: автор коммитов — Даша, если git представляется Claude; включает `scripts/hooks` |
| `.claude/hooks/block-no-verify.mjs`    | Claude не обходит git-хуки (`--no-verify`, подмена `core.hooksPath`) |
| `.claude/hooks/protect-gates.mjs`      | правка git-хуков, CI и снижение порога покрытия — только с согласия Даши |
| `.claude/settings.json`                | хуки Claude и запреты: деплой руками, чтение `.env`, `core.hooksPath`; пересъёмка эталонов снимков — с вопросом |
| `scripts/hooks/`                       | `commit-msg` (автор и подписи ИИ), `pre-push` (гейт перед продом; без `package.json` пропускает) |
| `.github/workflows/deploy.yml`         | гейт и деплой для пушей из облака; выключен до переменной `DEPLOY_ENABLED=true` |
| `scripts/setup-bot.mjs`, `set-bot-avatar.mjs` | настройка бота Telegram; имя и тексты не заданы (`TEXTS`)    |
| `.oxlintrc.json`                       | линтер гейта: правила хуков React, висящие промисы                  |
| `.mcp.json`                            | MCP `chrome-devtools` и `lazyweb` (описаны в README скиллов)        |
| `tools/dev/backlog.{sh,py}`            | сборка `docs/BACKLOG.md` из открытых Issues                         |

Тесты хуков (`.claude/hooks/*.test.ts`, `scripts/hooks/git-hooks.test.ts`)
написаны под vitest, который приедет с каркасом. До него — так (64 теста,
03.10.2026 зелёные):

```bash
# из корня репозитория
r=$PWD && d=$(mktemp -d) && cd "$d" && echo '{"type":"module"}' > package.json \
  && npm i -D --legacy-peer-deps vitest@5 vite@8 >/dev/null \
  && cp -r "$r/.claude" "$r/scripts" . && npx vitest run .claude/hooks scripts/hooks; cd "$r"
```

## Грабли

- **Облачная сессия подписывает коммиты «Claude <noreply@anthropic.com>»** из
  глобального конфига `/root/.gitconfig`. Хук `session-git.sh` ставит автора в
  локальный конфиг репозитория в начале сессии; на Маке со своим автором ничего
  не трогает. Если автор всё же Claude — `commit-msg` не пропустит коммит.
- **`npm i vitest@5` падает с «Cannot read properties of null (reading
  'edgesOut')»** — ошибка npm на пирах vitest; ставить с `--legacy-peer-deps` и
  явным `vite` (он у vitest 5 — пир).
- **Удалить ветку на GitHub из облачной сессии нельзя:** прокси обрывает
  `git push --delete`. Ветки удаляются на сайте.
- **В облаке нет `gh`.** Задачи — через GitHub MCP, зеркало — подать их JSON в
  `tools/dev/backlog.py` (как — в шапке файла).
- **Хук детектора `impeccable` в git не ездит** (`.claude/settings.local.json`):
  на Маке включить один раз — `/impeccable hooks on`.
- **Принудительный push в `main` из облака блокирует авто-режим Claude Code.**
  Переписать уже залитую историю — только с Мака или с явным разрешением.
