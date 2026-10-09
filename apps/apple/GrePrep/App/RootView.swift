import SwiftUI

/// Вошёл человек — разделы, нет — экран входа.
struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch app.phase {
            case let .signedOut(reason):
                SignInView(app: app, reason: reason)
            case .signedIn:
                if let today = app.today {
                    MainView(today: today)
                }
            }
        }
        .tint(Color(.accent))
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { Task { await app.trainings.flushReportDrafts() } }
            if phase == .active {
                app.retrySessionIfNeeded()
                app.trainings.sync()
            }
        }
        .onChange(of: app.network.isOnline) { _, online in
            if online { app.trainings.sync() }
        }
    }
}
