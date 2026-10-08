#!/bin/sh
# SessionStart: git в этом репозитории готов к работе по правилам AGENTS.md («Git»).
#   • Автор — Даша. В облачной сессии git по умолчанию подписывает коммиты «Claude <noreply@anthropic.com>» из
#     глобального конфига — так 03.10.2026 первые коммиты ушли не от её имени. Если git представляется Claude,
#     ставим автора в локальный конфиг репозитория; свою настройку на Маке и глобальный конфиг не трогаем.
#   • Хуки проекта (scripts/hooks: commit-msg — автор и подписи, pre-push — гейт перед продом) включены, если
#     core.hooksPath ещё не задан. Свой путь не перебиваем; Claude менять core.hooksPath запрещено (.claude/settings.json).
# Сбой хука не должен мешать сессии — всегда выход 0. Проверено вручную; тест — с каркасом (docs/ROADMAP.md).
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

email="$(git config user.email 2>/dev/null)"
name="$(git config user.name 2>/dev/null)"
case "$email $name" in
  *anthropic.com*|*Claude*) set_author=1 ;;
  *) [ -n "$email" ] && set_author=0 || set_author=1 ;;
esac
if [ "$set_author" = 1 ] && git config --local user.name 'Darya Leushkina' && git config --local user.email 15678175+daryaleushkina@users.noreply.github.com; then
  echo "git: автор коммитов в этом репозитории — Darya Leushkina <15678175+daryaleushkina@users.noreply.github.com> (AGENTS.md, «Git»)"
fi

if [ -z "$(git config core.hooksPath 2>/dev/null)" ] && [ -d scripts/hooks ] && git config --local core.hooksPath scripts/hooks; then
  echo "git: включены хуки проекта scripts/hooks (commit-msg, pre-push)"
fi
exit 0
