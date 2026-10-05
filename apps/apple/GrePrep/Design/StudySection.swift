import GPAPI
import SwiftUI

typealias TodayStateDTO = Components.Schemas.StepState

/// Раздел подготовки и его цвета: узел ленты, подпись, свет сверху экрана (DESIGN.md, «Цвета разделов»).
enum StudySection: String, Hashable, Sendable, CaseIterable {
    case verbal, quant, words, essay

    init(_ dto: Components.Schemas.Section) {
        switch dto {
        case .verbal: self = .verbal
        case .quant: self = .quant
        case .words: self = .words
        case .essay: self = .essay
        }
    }

    /// Названия разделов GRE остаются английскими и в русском интерфейсе — как на экзамене.
    var label: LocalizedStringResource {
        switch self {
        case .verbal: "Verbal"
        case .quant: "Quant"
        case .words: "Слова"
        case .essay: "Эссе"
        }
    }

    var color: Color {
        switch self {
        case .verbal: Color(.verbal)
        case .quant: Color(.quant)
        case .words: Color(.words)
        case .essay: Color(.essay)
        }
    }

    var tint: Color {
        switch self {
        case .verbal: Color(.verbalTint)
        case .quant: Color(.quantTint)
        case .words: Color(.wordsTint)
        case .essay: Color(.essayTint)
        }
    }

    /// Свет сверху экрана: под стеклом всегда есть цвет, иначе стекла не видно (DESIGN.md, «Материал»).
    var glowStrong: Color {
        switch self {
        case .verbal: Color(.glowVerbalStrong)
        case .quant: Color(.glowQuantStrong)
        case .words: Color(.glowWordsStrong)
        case .essay: Color(.glowEssayStrong)
        }
    }

    var glowSoft: Color {
        switch self {
        case .verbal: Color(.glowVerbalSoft)
        case .quant: Color(.glowQuantSoft)
        case .words: Color(.glowWordsSoft)
        case .essay: Color(.glowEssaySoft)
        }
    }

    /// Значок узла — SF Symbols: на Apple иконки системные (impeccable, iOS).
    var symbol: String {
        switch self {
        case .verbal: "text.bubble"
        case .quant: "function"
        case .words: "rectangle.on.rectangle"
        case .essay: "pencil.line"
        }
    }
}
