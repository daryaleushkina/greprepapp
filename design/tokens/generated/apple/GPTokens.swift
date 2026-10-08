// Сгенерировано design/tokens/build.mjs из design/tokens/src — руками не править.
// Цвета — в каталоге GPColors.xcassets (Color(.text), Color(.textSecondary)…): светлую и тёмную тему
// переключает система. Стекло и тени не генерируются: на Apple они системные (PRODUCT.md, «Platform»).
import SwiftUI

/// Отступы и промежутки, pt.
public enum GPSpace {
    public static let s2: CGFloat = 2
    public static let s4: CGFloat = 4
    public static let s6: CGFloat = 6
    public static let s8: CGFloat = 8
    public static let s10: CGFloat = 10
    public static let s12: CGFloat = 12
    public static let s14: CGFloat = 14
    public static let s16: CGFloat = 16
    public static let s20: CGFloat = 20
    public static let s24: CGFloat = 24
    public static let s28: CGFloat = 28
    public static let s32: CGFloat = 32
    public static let s40: CGFloat = 40
    public static let s48: CGFloat = 48
    public static let s56: CGFloat = 56
    public static let s64: CGFloat = 64
    public static let s72: CGFloat = 72
}

/// Радиусы скругления, pt. full — капсула: используйте Capsule().
public enum GPRadius {
    /// Клавиши-подсказки, мелкие метки
    public static let xs: CGFloat = 6
    /// Бейджи, маркеры
    public static let sm: CGFloat = 8
    /// MainButton Telegram, поля ввода
    public static let md: CGFloat = 12
    /// Варианты ответа, строки-кнопки
    public static let lg: CGFloat = 16
    /// Крупные плитки, подложка сегментов
    public static let xl: CGFloat = 20
    /// Карточки и сгруппированные списки
    public static let xxl: CGFloat = 26
    /// Капсулы: кнопки 44–48 px, чипы, вкладки, круги
    public static let full: CGFloat = 9999
}

/// Размеры элементов, pt.
public enum GPSize {
    /// Минимум для нажатия (Apple HIG, WCAG 2.5.8 с запасом)
    public static let tapTarget: CGFloat = 44
    /// Капсула главного действия внутри экрана
    public static let button: CGFloat = 48
    public static let buttonCompact: CGFloat = 44
    /// MainButton Telegram и её двойник вне Telegram
    public static let mainButton: CGFloat = 50
    /// Строка списка
    public static let row: CGFloat = 52
    /// Строка настроек, вариант ответа
    public static let rowTall: CGFloat = 56
    /// Узел ленты шагов
    public static let stepNode: CGFloat = 28
    /// Текущий узел ленты шагов
    public static let stepNodeCurrent: CGFloat = 36
    /// Нить ленты шагов
    public static let stepLine: CGFloat = 1.5
    /// Кольцо текущего узла ленты (цвет раздела *-tint)
    public static let stepRing: CGFloat = 5
    /// Точка конца ленты: «На сегодня всё.»
    public static let stepEnd: CGFloat = 9
    public static let tabBarHeight: CGFloat = 64
    public static let tabBarWidth: CGFloat = 340
    public static let tabBarBottom: CGFloat = 22
    /// Стеклянные круги шапки Telegram
    public static let headerButton: CGFloat = 44
    /// Растушёвка над нижней панелью
    public static let fade: CGFloat = 28
    /// Стеклянная плитка знака на экране входа
    public static let brandMark: CGFloat = 64
    /// Знак-лента внутри плитки
    public static let brandGlyph: CGFloat = 30
    /// Тонкая рамка: край стекла, контур узла ленты, рамка кнопки Google
    public static let hairline: CGFloat = 1
}

/// Раскладка, pt. breakpointWide — граница компактной и широкой раскладки.
public enum GPLayout {
    /// Боковые поля экрана на телефоне
    public static let gutter: CGFloat = 20
    /// Поля нижней панели с кнопками
    public static let gutterBar: CGFloat = 16
    /// Отступ сверху под шапку Telegram
    public static let topInset: CGFloat = 72
    public static let sidebarMin: CGFloat = 248
    public static let sidebarMax: CGFloat = 280
    /// Ширина колонки содержимого на компьютере
    public static let contentMax: CGFloat = 720
    /// С этой ширины — боковая панель и крупная типографика
    public static let breakpointWide: CGFloat = 900
    /// Сайт уже этой ширины — как телефон: капсула вкладок снизу; от неё до breakpoint-wide — строка разделов сверху (решение Даши 06.10.2026)
    public static let breakpointNarrow: CGFloat = 600
    /// Колонка экрана входа на широком экране (iPad, Mac, сайт)
    public static let authColumnMax: CGFloat = 420
    /// Строка о продукте под именем на экране входа
    public static let taglineMax: CGFloat = 320
}

/// Прозрачность состояний элементов.
public enum GPOpacity {
    public static let disabled: Double = 0.5
}

/// Роль текста: размер и межстрочный — pt, трекинг — доля размера (em), relativeTo — с каким стилем Dynamic Type растёт.
public struct GPTextStyle: Sendable {
    public let size: CGFloat
    public let lineHeight: CGFloat
    public let weight: Font.Weight
    public let tracking: CGFloat
    public let relativeTo: Font.TextStyle
}

/// Роли текста. Шрифт — Onest, вшитый в приложение. Wide — та же роль в широкой раскладке (iPad, Mac).
public enum GPType {
    public static let fontFamily = "Onest"
    /// Настройка «Крупнее»: множитель размера поверх Dynamic Type.
    public static let textScaleLarge: CGFloat = 1.125
    /// Крупное число итога: балл, «12 из 12»
    public static let display = GPTextStyle(size: 56, lineHeight: 60, weight: .semibold, tracking: -0.03, relativeTo: .largeTitle)
    public static let displayWide = GPTextStyle(size: 72, lineHeight: 76, weight: .semibold, tracking: -0.03, relativeTo: .largeTitle)
    /// Примерный балл пробника
    public static let score = GPTextStyle(size: 48, lineHeight: 52, weight: .semibold, tracking: -0.025, relativeTo: .largeTitle)
    /// Слово на карточке словаря
    public static let headword = GPTextStyle(size: 36, lineHeight: 42, weight: .semibold, tracking: -0.025, relativeTo: .largeTitle)
    public static let headwordWide = GPTextStyle(size: 48, lineHeight: 54, weight: .semibold, tracking: -0.025, relativeTo: .largeTitle)
    /// Заголовок экрана-вкладки
    public static let title1 = GPTextStyle(size: 32, lineHeight: 38, weight: .semibold, tracking: -0.025, relativeTo: .largeTitle)
    public static let title1Wide = GPTextStyle(size: 40, lineHeight: 46, weight: .semibold, tracking: -0.025, relativeTo: .largeTitle)
    /// Заголовок экрана сессии и итогов
    public static let title2 = GPTextStyle(size: 28, lineHeight: 34, weight: .semibold, tracking: -0.025, relativeTo: .title)
    public static let title2Wide = GPTextStyle(size: 36, lineHeight: 42, weight: .semibold, tracking: -0.025, relativeTo: .title)
    /// Заголовок карточки-шага
    public static let title3 = GPTextStyle(size: 19, lineHeight: 24, weight: .semibold, tracking: 0, relativeTo: .title3)
    public static let title3Wide = GPTextStyle(size: 21, lineHeight: 28, weight: .semibold, tracking: 0, relativeTo: .title3)
    /// Таймер секции, tabular-nums
    public static let timer = GPTextStyle(size: 22, lineHeight: 26, weight: .semibold, tracking: 0, relativeTo: .title3)
    public static let timerWide = GPTextStyle(size: 24, lineHeight: 28, weight: .semibold, tracking: 0, relativeTo: .title3)
    /// Текст задания на английском: длинное чтение, межстрочный 1.5
    public static let prompt = GPTextStyle(size: 18, lineHeight: 27, weight: .regular, tracking: 0, relativeTo: .body)
    public static let promptWide = GPTextStyle(size: 20, lineHeight: 31, weight: .regular, tracking: 0, relativeTo: .body)
    /// Название темы, карточка
    public static let headline = GPTextStyle(size: 18, lineHeight: 24, weight: .semibold, tracking: 0, relativeTo: .headline)
    /// Основной текст интерфейса, строки списков
    public static let body = GPTextStyle(size: 17, lineHeight: 22, weight: .regular, tracking: 0, relativeTo: .body)
    /// Абзацы: разбор, теория
    public static let bodyLong = GPTextStyle(size: 17, lineHeight: 24, weight: .regular, tracking: 0, relativeTo: .body)
    /// Значение в строке, кнопки-капсулы
    public static let callout = GPTextStyle(size: 16, lineHeight: 21, weight: .medium, tracking: 0, relativeTo: .callout)
    /// Подзаголовок под заголовком, подписи разделов
    public static let subhead = GPTextStyle(size: 15, lineHeight: 20, weight: .regular, tracking: 0, relativeTo: .subheadline)
    /// Ссылки-действия второго плана, мета вопроса
    public static let footnote = GPTextStyle(size: 14, lineHeight: 18, weight: .medium, tracking: 0, relativeTo: .footnote)
    /// Даты, примечания, юридический текст
    public static let caption = GPTextStyle(size: 13, lineHeight: 18, weight: .regular, tracking: 0, relativeTo: .caption)
    /// Подсказки клавиш на компьютере
    public static let key = GPTextStyle(size: 12, lineHeight: 15, weight: .medium, tracking: 0, relativeTo: .caption2)
    /// Подписи вкладок — меньше не бывает: это нижняя граница шкалы
    public static let tabLabel = GPTextStyle(size: 11, lineHeight: 13, weight: .medium, tracking: 0, relativeTo: .caption2)
}

/// Движение. Длительности — секунды; при «Уменьшить движение» анимации нажатия и появления выключаются.
public enum GPMotion {
    public static let press: Double = 0.16
    public static let reveal: Double = 0.24
    public static let pulse: Double = 1.6
    public static let pressScale: CGFloat = 0.98
    public static func easeOut(duration: Double) -> Animation {
        .timingCurve(0.23, 1, 0.32, 1, duration: duration)
    }
}
