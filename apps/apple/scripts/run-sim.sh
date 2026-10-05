#!/bin/sh
# Собрать отладочную сборку и запустить на своём симуляторе: sh scripts/run-sim.sh [iphone|ipad|iphone-ios18]
# Адрес сервера — из сборки (127.0.0.1:8090); GP_API_BASE_URL в окружении — подмена (только отладка).
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"
udid="$(sh scripts/simulator.sh "${1:-iphone}")"
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
sh scripts/generate-project.sh
# Без пайпа: в sh нет pipefail, и упавшая сборка запустила бы на симуляторе прошлую.
log="$(mktemp)"
if ! xcodebuild -quiet -project GrePrep.xcodeproj -scheme GrePrep -destination "id=$udid" -derivedDataPath build/dd \
  build >"$log" 2>&1; then
  grep -v UnusedImportAccess "$log" >&2
  rm -f "$log"
  exit 1
fi
rm -f "$log"
xcrun simctl install "$udid" build/dd/Build/Products/Debug-iphonesimulator/GrePrep.app
xcrun simctl terminate "$udid" dev.greprepapp.app 2>/dev/null || true
if [ -n "${GP_API_BASE_URL:-}" ]; then
  SIMCTL_CHILD_GP_API_BASE_URL="$GP_API_BASE_URL" xcrun simctl launch "$udid" dev.greprepapp.app >/dev/null
else
  xcrun simctl launch "$udid" dev.greprepapp.app >/dev/null
fi
echo "$udid"
