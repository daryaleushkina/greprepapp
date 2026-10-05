// swift-tools-version: 6.0
// Клиент API, сгенерированный из api/openapi.yaml генератором Apple (scripts/generate-api.sh).
// Sources/GPAPI/Generated — руками не править; гейт заново генерирует и сверяет с коммитом.
// Sources/GPAPI/Support — своё: сборка клиента и токен сессии. Всё, что знает про OpenAPIRuntime и HTTPTypes,
// живёт здесь, а приложение импортирует только GPAPI.
import PackageDescription

let package = Package(
    name: "GPAPI",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "GPAPI", targets: ["GPAPI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.2"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.3.2"),
        .package(url: "https://github.com/apple/swift-http-types", exact: "1.8.0"),
    ],
    targets: [
        .target(
            name: "GPAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        )
    ]
)
