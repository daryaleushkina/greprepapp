import SwiftUI

/// Стекло Apple там, где оно есть (iOS 26, macOS 26), ниже — та же форма с матовой подложкой
/// (PRODUCT.md, «Platform»). При «Уменьшить прозрачность» система сама делает подложку плотной.
struct GlassSurface<S: Shape>: ViewModifier {
    let shape: S
    var interactive = false
    @Environment(\.glassEnabled) private var glassEnabled

    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *), glassEnabled {
            content.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            content
                .background(.regularMaterial, in: shape)
                .overlay(shape.stroke(Color(.glassEdge), lineWidth: GPSize.hairline))
        }
    }
}

extension EnvironmentValues {
    /// Снимки экранов выключают стекло: оно преломляет то, что под ним, и каждый кадр выходит чуть другим.
    /// Стекло — системное, проверять его вид нам незачем; раскладку проверяет матовая подложка.
    @Entry var glassEnabled = true
}

extension View {
    func glassSurface(in shape: some Shape, interactive: Bool = false) -> some View {
        modifier(GlassSurface(shape: shape, interactive: interactive))
    }
}

/// Нажатие: лёгкое сжатие сразу под пальцем (DESIGN.md, «Движение»), без масштаба при «Уменьшить движение».
struct PressScaleStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? GPMotion.pressScale : 1)
            .animation(GPMotion.easeOut(duration: GPMotion.press), value: configuration.isPressed)
    }
}

/// Главная кнопка внутри экрана: капсула цвета accent (DESIGN.md, «Primary»).
struct PrimaryCapsuleStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled

    // Выключенный вид общий для всех главных действий, включая ожидание запроса и пустой выбор.
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .gpText(GPType.callout)
            .fontWeight(.semibold)
            .foregroundStyle(Color(.onAccent))
            .frame(maxWidth: .infinity, minHeight: GPSize.button)
            .padding(.horizontal, GPSpace.s24)
            .background(Color(.accent), in: Capsule())
            .contentShape(Capsule())
            .opacity(isEnabled ? 1 : GPOpacity.disabled)
            .scaleEffect(configuration.isPressed && !reduceMotion ? GPMotion.pressScale : 1)
            .animation(GPMotion.easeOut(duration: GPMotion.press), value: configuration.isPressed)
    }
}

/// Свет сверху экрана — цвет раздела в фокусе; под стеклом ему есть что преломлять. Тот же эллипс, что в
/// макетах: `radial-gradient(120% 52% at 50% -10%, …)` — полуоси 120 % ширины и 52 % высоты, центр выше экрана.
/// Эллипс рисуется целиком и гаснет сам, без обрезки рамкой (иначе на широком окне виден край).
struct SectionGlow: View {
    let section: StudySection?

    var body: some View {
        ZStack {
            Color(.bg)
            if let section {
                GeometryReader { proxy in
                    let size = proxy.size
                    EllipticalGradient(
                        stops: [
                            .init(color: section.glowStrong, location: 0),
                            .init(color: section.glowSoft, location: 0.48),
                            .init(color: .clear, location: 0.74),
                        ],
                        center: .center
                    )
                    .frame(width: size.width * 2.4, height: size.height * 1.04)
                    .position(x: size.width / 2, y: -size.height * 0.1)
                }
            }
        }
        .ignoresSafeArea()
    }
}
