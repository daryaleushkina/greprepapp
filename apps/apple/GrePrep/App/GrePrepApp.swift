import SwiftUI

@main
struct GrePrepApp: App {
    /// nil — приложение запущено хостом юнит-тестов: тогда оно не трогает ни Keychain, ни сеть.
    @State private var app: AppModel?

    init() {
        Fonts.registerOnest()
        #if DEBUG
            // Сценарии UI начинают с чистого устройства: без входа и без прошлого плана.
            if ProcessInfo.processInfo.arguments.contains("-GPResetState") {
                AppModel.resetLocalState()
            }
        #endif
        if !AppConfig.isRunningUnitTests {
            _app = State(initialValue: AppModel.live())
        }
    }

    var body: some Scene {
        WindowGroup {
            if let app {
                RootView()
                    .environment(app)
            }
        }
        #if os(macOS)
            .defaultSize(width: 1100, height: 760)
        #endif
    }
}
