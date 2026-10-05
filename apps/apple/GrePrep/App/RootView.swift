import SwiftUI

/// Вошёл человек — разделы, нет — экран входа.
struct RootView: View {
    @Environment(AppModel.self) private var app

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
    }
}
