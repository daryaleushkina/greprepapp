import SwiftUI

/// Вкладка «Сегодня»: лента шагов на день (макет T1-Today, design/directions).
struct TodayView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    let model: TodayModel
    /// Снимки экранов выключают запрос при появлении: иначе кадр ловит его на полпути.
    let refreshesOnAppear: Bool
    let onTraining: (TrainingEntry) -> Void
    @State private var didRefreshOnAppear = false
    @State private var path: [TodayPlan.Step] = []
    @State private var blockedStepID: TodayPlan.Step.ID?

    /// blockedStepID — шаг, у которого уже показано «нужна сеть» (для снимков экрана).
    init(
        model: TodayModel, refreshesOnAppear: Bool = true, blockedStepID: TodayPlan.Step.ID? = nil,
        onTraining: @escaping (TrainingEntry) -> Void = { _ in }
    ) {
        self.model = model
        self.refreshesOnAppear = refreshesOnAppear
        self.onTraining = onTraining
        _blockedStepID = State(initialValue: blockedStepID)
    }

    var body: some View {
        NavigationStack(path: $path) {
            screen
                .safeAreaInset(edge: .top) {
                    if app.trainings.reviewClosed {
                        Text("Эта тренировка больше не хранится на устройстве.").gpText(GPType.footnote)
                            .foregroundStyle(Color(.textSecondary)).padding(GPSpace.s12)
                            .accessibilityIdentifier("today.reviewClosed")
                    }
                }
                .navigationTitle(Text("Сегодня"))
                .navigationDestination(for: TodayPlan.Step.self) { step in
                    StepPlaceholderView(step: step)
                }
        }
        .task {
            // Полноэкранная тренировка скрывает вкладки; возврат не требует повторять исходный запрос.
            if refreshesOnAppear, !didRefreshOnAppear {
                didRefreshOnAppear = true
                // NWPathMonitor мог ответить до появления экрана: сначала сверяем сеть, затем обновляем план.
                await model.networkChanged(online: app.network.isOnline)
                await model.refreshIfStale()
            }
        }
        .onChange(of: app.network.isOnline) { _, online in
            if online { blockedStepID = nil }
            Task { await model.networkChanged(online: online) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await model.refreshIfStale() }
            }
        }
    }

    @ViewBuilder private var screen: some View {
        switch model.content {
        case .loading:
            TodayLoadingView()
                .background { SectionGlow(section: nil) }
        case let .unavailable(problem):
            TodayUnavailableView(problem: problem, isRetrying: model.isRefreshing) {
                Task { await model.refresh() }
            }
            .background { SectionGlow(section: nil) }
        case let .plan(plan):
            planView(plan)
        }
    }

    private func planView(_ plan: TodayPlan) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: TodaySummary.string(for: plan))
                    .gpText(GPType.subhead)
                    .monospacedDigit()
                    .foregroundStyle(Color(.textSecondary))
                    .accessibilityIdentifier("today.summary")
                if let stale = model.staleReason {
                    StaleNotice(reason: stale)
                        .padding(.top, GPSpace.s12)
                }
                if let training = app.trainings.active {
                    Button {
                        onTraining(.session(training.id))
                    } label: {
                        HStack(spacing: GPSpace.s12) {
                            VStack(alignment: .leading, spacing: GPSpace.s4) {
                                Text("Продолжить тренировку").gpText(GPType.headline)
                                Text(verbatim: TrainingCopy.continuation(training)).gpText(GPType.subhead)
                                    .foregroundStyle(StudySection(training.session.section).color)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: GPSpace.s8)
                            Image(systemName: "chevron.forward").foregroundStyle(Color(.textSecondary))
                        }.frame(minHeight: GPSize.rowTall).padding(GPSpace.s16)
                            .background(Color(.surface), in: RoundedRectangle(cornerRadius: GPRadius.xxl))
                            .contentShape(RoundedRectangle(cornerRadius: GPRadius.xxl))
                    }.buttonStyle(PressScaleStyle()).padding(.top, GPSpace.s20)
                        .accessibilityIdentifier("today.continueTraining")
                }
                StepRibbon(plan: plan, blockedStepID: blockedStepID, onSelect: select)
                    .padding(.top, GPSpace.s28)
                Button {
                    onTraining(.builder(nil))
                } label: {
                    Text("Своя тренировка").gpText(GPType.callout)
                        .frame(maxWidth: .infinity, minHeight: GPSize.button)
                        .background(Color(.surface), in: Capsule())
                }.buttonStyle(.plain).padding(.top, GPSpace.s32)
                    .accessibilityIdentifier("today.newTraining")
            }
            // Колонка не шире 720 и прижата к краю заголовка: на iPad и Mac лишняя ширина остаётся справа
            // пустой (DESIGN.md, «Раскладка»), а лента не уезжает от заголовка экрана.
            .frame(maxWidth: GPLayout.contentMax, alignment: .leading)
            .padding(.horizontal, GPLayout.gutter)
            #if os(macOS)
                // На Mac заголовок — в панели окна, а не крупный над лентой: нужен воздух под панелью.
                .padding(.top, GPSpace.s20)
            #endif
            .padding(.bottom, GPSpace.s32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .refreshable { await model.refresh() }
        .background { SectionGlow(section: plan.current?.section) }
    }

    /// Новую сессию без сети не начать (PRODUCT.md, «Operating Context»): вместо перехода — объяснение у шага.
    private func select(_ step: TodayPlan.Step) {
        if !app.network.isOnline || model.staleReason == .offline {
            blockedStepID = step.id
            return
        }
        blockedStepID = nil
        if step.section == .verbal || step.section == .quant {
            onTraining(.builder(.init(section: step.section == .verbal ? .verbal : .quant)))
            return
        }
        path.append(step)
    }
}

/// Тихая строка над лентой: план на экране — прошлый.
private struct StaleNotice: View {
    let reason: TodayModel.Problem

    var body: some View {
        Label {
            switch reason {
            case .offline: Text("Нет сети — план обновится сам, когда она появится.")
            case .failed: Text("Не получилось обновить план — покажем свежий, как только сервер ответит.")
            }
        } icon: {
            Image(
                systemName: reason == .offline
                    ? "wifi.slash" : "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90")
        }
        .gpText(GPType.subhead)
        .foregroundStyle(Color(.textSecondary))
        .accessibilityIdentifier("today.stale")
    }
}

/// Загрузка плана (макет T5-Loading).
private struct TodayLoadingView: View {
    var body: some View {
        VStack(spacing: GPSpace.s12) {
            ProgressView()
                .controlSize(.regular)
            Text("Загружаем план на сегодня")
                .gpText(GPType.subhead)
                .foregroundStyle(Color(.textSecondary))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("today.loading")
    }
}

/// Плана нет ни с сервера, ни на устройстве.
private struct TodayUnavailableView: View {
    let problem: TodayModel.Problem
    /// Повтор идёт: экран не мигает загрузкой, а кнопка показывает, что запрос ушёл.
    let isRetrying: Bool
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label {
                switch problem {
                case .offline: Text("Нет сети")
                case .failed: Text("Не получилось загрузить план")
                }
            } icon: {
                Image(systemName: problem == .offline ? "wifi.slash" : "exclamationmark.triangle")
            }
            .gpText(GPType.title3)
        } description: {
            switch problem {
            case .offline: Text("План на сегодня загрузится, когда появится сеть.")
            case .failed: Text("Мы уже знаем об ошибке. Попробуйте ещё раз чуть позже.")
            }
        } actions: {
            Button(action: retry) {
                // Текст остаётся на месте (прозрачным), чтобы кнопка не меняла ширину во время повтора.
                Text("Повторить")
                    .opacity(isRetrying ? 0 : 1)
                    .overlay {
                        if isRetrying { ProgressView().tint(Color(.onAccent)) }
                    }
            }
            .buttonStyle(PrimaryCapsuleStyle())
            .fixedSize()
            .disabled(isRetrying)
            .accessibilityIdentifier("today.retry")
        }
        .accessibilityIdentifier("today.unavailable")
    }
}
