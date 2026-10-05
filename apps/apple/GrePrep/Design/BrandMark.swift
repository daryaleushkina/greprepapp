import SwiftUI

/// Знак — та же лента шагов, что в приложении (макет T4-SignIn): три узла на нити и строки шагов.
/// Это рисунок, а не раскладка: координаты — в его собственной сетке 30 × 30 (как path в SVG макета), рамку
/// задаёт токен GPSize.brandGlyph.
struct BrandMark: View {
    var body: some View {
        Canvas { context, size in
            let k = min(size.width, size.height) / 30
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
            let stroke = StrokeStyle(lineWidth: 1.8 * k, lineCap: .round)
            let shading = GraphicsContext.Shading.foreground

            var thread = Path()
            thread.move(to: p(9, 7.5))
            thread.addLine(to: p(9, 22.5))
            context.opacity = 0.45
            context.stroke(thread, with: shading, style: stroke)
            context.opacity = 1

            context.fill(
                Path(ellipseIn: CGRect(x: (9 - 3.6) * k, y: (6 - 3.6) * k, width: 7.2 * k, height: 7.2 * k)),
                with: shading)
            for y in [15.0, 24.0] {
                let rect = CGRect(x: (9 - 2.6) * k, y: (y - 2.6) * k, width: 5.2 * k, height: 5.2 * k)
                context.stroke(Path(ellipseIn: rect), with: shading, style: stroke)
            }
            var lines = Path()
            for (y, end) in [(6.0, 24.0), (15.0, 22.0), (24.0, 23.0)] {
                lines.move(to: p(16, y))
                lines.addLine(to: p(end, y))
            }
            context.stroke(lines, with: shading, style: stroke)
        }
    }
}
