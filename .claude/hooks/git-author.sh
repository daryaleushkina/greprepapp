#!/bin/sh
# SessionStart: автор коммитов в этом репозитории — Даша (CLAUDE.md, «Git»). В облачной сессии git по умолчанию
# подписывает коммиты «Claude <noreply@anthropic.com>» из глобального конфига — так 03.10.2026 первые два коммита
# ушли не от её имени. Если git представляется Claude, ставим автора в локальный конфиг репозитория; свою
# настройку на Маке и глобальный конфиг не трогаем. Сбой хука не должен мешать сессии — всегда выход 0.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

email="$(git config user.email 2>/dev/null)"
name="$(git config user.name 2>/dev/null)"
case "$email $name" in
  *anthropic.com*|*Claude*) ;;
  *) [ -n "$email" ] && exit 0 ;;
esac

git config --local user.name daryaleushkina && git config --local user.email darya_leushkina@mail.ru &&
  echo "git: автор коммитов в этом репозитории — daryaleushkina <darya_leushkina@mail.ru> (CLAUDE.md, «Git»)"
exit 0
