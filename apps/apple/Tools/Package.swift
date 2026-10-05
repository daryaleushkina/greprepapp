// swift-tools-version: 6.0
// Инструменты разработки, не код приложения: генератор клиента API по api/openapi.yaml.
// Отдельный пакет — как server/tools у Go: зависимости генератора не попадают в приложение.
// Запуск — scripts/generate-api.sh.
import PackageDescription

let package = Package(
    name: "Tools",
    platforms: [.macOS(.v15)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1")
    ]
)
