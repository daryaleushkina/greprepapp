import SwiftUI

/// Разделы приложения: «Сегодня · Слова · Экзамен · Прогресс» (PRODUCT.md, «Навигация»). Вкладки системные:
/// на iOS 26 — стеклянная капсула, на iPad и Mac — боковая панель (DESIGN.md, «Нативные приложения»).
struct MainView: View {
    @Environment(AppModel.self) private var app
    let today: TodayModel
    var refreshesOnAppear = true
    @State private var selection: AppTab = .today
    @State private var trainingEntry: TrainingEntry?

    enum AppTab: Hashable {
        case today, words, exam, progress
    }

    var body: some View {
        if let trainingEntry {
            TrainingFlow(entry: trainingEntry, trainings: app.trainings) { self.trainingEntry = nil }
        } else {
            tabs
        }
    }

    private var tabs: some View {
        TabView(selection: $selection) {
            Tab(value: AppTab.today) {
                TodayView(model: today, refreshesOnAppear: refreshesOnAppear, onTraining: { trainingEntry = $0 })
            } label: {
                Label {
                    Text("Сегодня")
                } icon: {
                    Image(systemName: "list.bullet.indent")
                }
            }
            Tab(value: AppTab.words) {
                SectionPlaceholderView(
                    title: "Слова",
                    message: "Здесь будет словарь: слова на сегодня, повторение и поиск."
                )
            } label: {
                Label {
                    Text("Слова")
                } icon: {
                    Image(systemName: "rectangle.on.rectangle")
                }
            }
            Tab(value: AppTab.exam) {
                SectionPlaceholderView(
                    title: "Экзамен",
                    message: "Здесь будут пробный экзамен как настоящий GRE и эссе с оценкой."
                )
            } label: {
                Label {
                    Text("Экзамен")
                } icon: {
                    Image(systemName: "stopwatch")
                }
            }
            Tab(value: AppTab.progress) {
                ProgressTabView()
            } label: {
                Label {
                    Text("Прогресс")
                } icon: {
                    Image(systemName: "chart.bar")
                }
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        // Выбранная вкладка — цветом текста, а не системным синим: один акцент на всё приложение.
        .tint(Color(.accent))
    }
}

/// Раздел, которого в каркасе ещё нет: честно говорит, что здесь будет.
struct SectionPlaceholderView: View {
    let title: LocalizedStringKey
    let message: LocalizedStringKey

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Text("Скоро")
                    .gpText(GPType.title3)
            } description: {
                Text(message)
            }
            .navigationTitle(Text(title))
            .background { SectionGlow(section: nil) }
        }
    }
}

/// Шаг ленты, открытый из «Сегодня». Сами тренировки и слова — следующие части (ROADMAP §5).
struct StepPlaceholderView: View {
    let step: TodayPlan.Step

    var body: some View {
        ContentUnavailableView {
            Text(step.title)
                .gpText(GPType.title3)
        } description: {
            Text("Здесь начнётся шаг. Тренировки и слова появятся в следующих частях.")
        }
        .background { SectionGlow(section: step.section) }
        .navigationTitle(Text(step.section.label))
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
        .accessibilityIdentifier("step.placeholder")
    }
}
