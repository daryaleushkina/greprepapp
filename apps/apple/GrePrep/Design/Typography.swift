import SwiftUI

#if os(iOS)
    import UIKit
#else
    import AppKit
#endif

/// Шрифт Onest вшит в приложение и регистрируется при запуске: так он одинаково виден в приложении, превью
/// и тестах снимков на iPhone, iPad и Mac (Info.plist UIAppFonts есть только на iOS).
enum Fonts {
    static func registerOnest() {
        guard let url = Bundle.main.url(forResource: "Onest-Variable", withExtension: "ttf") else {
            assertionFailure("Onest-Variable.ttf is missing from the app bundle")
            return
        }
        var error: Unmanaged<CFError>?
        guard !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let error else { return }
        let failure = error.takeRetainedValue()
        // Повторная регистрация (второе окно на Mac, хост тестов) отвечает «уже есть» — это не ошибка.
        guard CFErrorGetCode(failure) != CTFontManagerError.alreadyRegistered.rawValue else { return }
        assertionFailure("Onest registration failed: \(failure)")
    }
}

extension Font {
    /// Роль текста из токенов (GPType): Onest, растёт с Dynamic Type вместе со своим системным стилем.
    static func gp(_ style: GPTextStyle, scale: CGFloat = 1) -> Font {
        .custom(GPType.fontFamily, size: style.size * scale, relativeTo: style.relativeTo).weight(style.weight)
    }
}

/// Межстрочный и трекинг роли текста: SwiftUI задаёт добавку к естественной высоте строки шрифта, а не
/// высоту строки, поэтому добавка считается от метрик Onest (ascender 970 + descender 305 на 1000).
struct GPTextModifier: ViewModifier {
    let style: GPTextStyle
    @Environment(\.textScale) private var textScale
    @ScaledMetric private var scale: CGFloat = 1

    init(_ style: GPTextStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        content
            .font(
                .custom(GPType.fontFamily, size: style.size * textScale, relativeTo: style.relativeTo).weight(
                    style.weight)
            )
            .tracking(style.tracking * style.size * scale * textScale)
            .lineSpacing(max(0, (style.lineHeight - style.size * Self.naturalLineHeight) * scale * textScale))
    }

    static let naturalLineHeight: CGFloat = 1.275
}

extension EnvironmentValues {
    /// «Крупнее» поверх Dynamic Type; будущая настройка и снимки используют один множитель из токенов.
    @Entry var textScale: CGFloat = 1
}

extension View {
    func gpText(_ style: GPTextStyle) -> some View {
        modifier(GPTextModifier(style))
    }
}
