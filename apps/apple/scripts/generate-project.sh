#!/bin/sh
# Проект Xcode из project.yml и закреплённые версии пакетов (Package.resolved в git: сам проект в git не лежит,
# а без файла версий SwiftPM брал бы свежие зависимости зависимостей при каждой сборке).
#   sh scripts/generate-project.sh            — собрать проект с версиями из Package.resolved
#   sh scripts/generate-project.sh --update   — разрешить версии заново и записать новый Package.resolved
set -eu
cd "$(dirname "$0")/.."
command -v xcodegen >/dev/null 2>&1 || { echo "нет xcodegen: brew install xcodegen" >&2; exit 1; }
xcodegen generate --quiet
lock="GrePrep.xcodeproj/project.xcworkspace/xcshareddata/swiftpm"
mkdir -p "$lock"
if [ "${1:-}" = "--update" ]; then
  rm -f "$lock/Package.resolved"
  xcodebuild -quiet -resolvePackageDependencies -project GrePrep.xcodeproj -scheme GrePrep
  cp "$lock/Package.resolved" Package.resolved
else
  cp Package.resolved "$lock/Package.resolved"
fi
