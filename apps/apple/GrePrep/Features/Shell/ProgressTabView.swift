import SwiftUI

/// «Прогресс» и вход в настройки (PRODUCT.md, «Навигация»: настройки — в «Прогрессе»). Пока тренировок нет,
/// экран пустой, как в макете G6-ProgressEmpty.
struct ProgressTabView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Text("Тренировок ещё не было")
                    .gpText(GPType.title3)
            } description: {
                Text("Здесь появятся темы, где больше всего ошибок, — по порядку, с чего начать.")
            }
            .background { SectionGlow(section: nil) }
            .navigationTitle(Text("Прогресс"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label {
                            Text("Настройки")
                        } icon: {
                            Image(systemName: "gearshape")
                        }
                    }
                    .accessibilityIdentifier("progress.settings")
                }
            }
        }
    }
}

/// Настройки (макет G2-Settings). В каркасе — только выход и версия; язык, тема, размер текста и способы
/// входа приходят со своими частями.
struct SettingsView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Form {
            Section {
                Button(role: .destructive) {
                    app.signOut()
                } label: {
                    Text("Выйти")
                }
                .accessibilityIdentifier("settings.signOut")
            } footer: {
                Text("Версия \(app.config.appVersion)")
                    .monospacedDigit()
            }
        }
        .formStyle(.grouped)
        .navigationTitle(Text("Настройки"))
    }
}
