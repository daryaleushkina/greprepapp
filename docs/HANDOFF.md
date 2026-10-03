# GrePrepApp — как всё устроено

Кода пока нет: каркас — первая задача (`docs/ROADMAP.md`). Правила работы —
`CLAUDE.md`.

## Что лежит в репозитории

| Путь                           | Что                                                                 |
| ------------------------------ | ------------------------------------------------------------------- |
| `CLAUDE.md`                    | правила работы                                                      |
| `.claude/skills/`              | скиллы дизайна, Telegram и мобилки; разбор — `.claude/skills/README.md` |
| `.claude/agents/impeccable-*`  | агенты скилла `impeccable`                                          |
| `.claude/hooks/git-author.sh`  | SessionStart: автор коммитов — Даша, если git представляется Claude |
| `.mcp.json`                    | MCP `chrome-devtools` и `lazyweb` (описаны в README скиллов)        |
| `tools/dev/backlog.{sh,py}`    | сборка `docs/BACKLOG.md` из открытых Issues                         |

## Грабли

- **Облачная сессия подписывает коммиты «Claude <noreply@anthropic.com>»** из
  глобального конфига `/root/.gitconfig`. Хук `git-author.sh` ставит автора в
  локальный конфиг репозитория в начале сессии. На Маке хук ничего не трогает,
  если там свой автор.
- **В облаке нет `gh`.** Задачи — через GitHub MCP, зеркало — подать их JSON в
  `tools/dev/backlog.py` (как — в шапке файла).
- **Хук детектора `impeccable` в git не ездит** (`.claude/settings.local.json`):
  на Маке включить один раз — `/impeccable hooks on`.
- **Принудительный push в `main` из облака блокирует авто-режим Claude Code.**
  Переписать уже залитую историю — только с Мака или с явным разрешением.
