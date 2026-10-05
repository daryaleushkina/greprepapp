import Foundation

/// План дня в словах экрана: то, что пришло от сервера, без типов генератора.
struct TodayPlan: Equatable, Sendable {
    let date: String
    let steps: [Step]

    struct Step: Hashable, Identifiable, Sendable {
        let id: String
        let section: StudySection
        let title: String
        let minutes: Int
        let state: State
    }

    enum State: Hashable, Sendable {
        case done, current, next
    }

    init(date: String, steps: [Step]) {
        self.date = date
        self.steps = steps
    }

    init(_ dto: TodayDTO) {
        date = dto.date
        steps = dto.steps.map { step in
            Step(
                id: step.id,
                section: StudySection(step.section),
                title: step.title,
                minutes: step.minutes,
                state: State(step.state)
            )
        }
    }

    var totalMinutes: Int { steps.reduce(0) { $0 + $1.minutes } }
    var isComplete: Bool { !steps.isEmpty && steps.allSatisfy { $0.state == .done } }
    /// Шаг в фокусе: освещён на экране и задаёт цвет света сверху.
    var current: Step? { steps.first { $0.state == .current } }
}

extension TodayPlan.State {
    fileprivate init(_ dto: TodayStateDTO) {
        switch dto {
        case .done: self = .done
        case .current: self = .current
        case .next: self = .next
        }
    }
}
