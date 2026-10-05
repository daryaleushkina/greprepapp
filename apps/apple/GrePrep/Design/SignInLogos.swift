// Сгенерировано scripts/svg2swift.py из scripts/logos/*.svg — руками не править.
import SwiftUI

/// Бумажный самолётик Telegram (официальный логотип), красится цветом переднего плана.
struct TelegramLogoShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 22, rect.height / 22)
        let path = Path { p in
            p.move(to: CGPoint(x: 2.814, y: 10.59))
            p.addCurve(
                to: CGPoint(x: 11.92, y: 6.67), control1: CGPoint(x: 7.369, y: 8.61),
                control2: CGPoint(x: 10.41, y: 7.302))
            p.addCurve(
                to: CGPoint(x: 17.75, y: 4.541), control1: CGPoint(x: 16.27, y: 4.865),
                control2: CGPoint(x: 17.17, y: 4.551))
            p.addCurve(
                to: CGPoint(x: 18.36, y: 4.723), control1: CGPoint(x: 17.88, y: 4.539),
                control2: CGPoint(x: 18.17, y: 4.571))
            p.addCurve(
                to: CGPoint(x: 18.58, y: 5.146), control1: CGPoint(x: 18.52, y: 4.851),
                control2: CGPoint(x: 18.56, y: 5.024))
            p.addCurve(
                to: CGPoint(x: 18.61, y: 5.761), control1: CGPoint(x: 18.6, y: 5.267),
                control2: CGPoint(x: 18.63, y: 5.545))
            p.addCurve(
                to: CGPoint(x: 16.84, y: 16.99), control1: CGPoint(x: 18.37, y: 8.231),
                control2: CGPoint(x: 17.35, y: 14.23))
            p.addCurve(
                to: CGPoint(x: 15.77, y: 18.6), control1: CGPoint(x: 16.62, y: 18.16),
                control2: CGPoint(x: 16.19, y: 18.56))
            p.addCurve(
                to: CGPoint(x: 13.29, y: 17.42), control1: CGPoint(x: 14.86, y: 18.68),
                control2: CGPoint(x: 14.17, y: 18))
            p.addCurve(
                to: CGPoint(x: 9.808, y: 15.08), control1: CGPoint(x: 11.92, y: 16.52),
                control2: CGPoint(x: 11.14, y: 15.96))
            p.addCurve(
                to: CGPoint(x: 10.14, y: 12.59), control1: CGPoint(x: 8.265, y: 14.06),
                control2: CGPoint(x: 9.266, y: 13.5))
            p.addCurve(
                to: CGPoint(x: 14.45, y: 8.384), control1: CGPoint(x: 10.37, y: 12.35),
                control2: CGPoint(x: 14.37, y: 8.714))
            p.addCurve(
                to: CGPoint(x: 14.38, y: 8.108), control1: CGPoint(x: 14.46, y: 8.343),
                control2: CGPoint(x: 14.47, y: 8.189))
            p.addCurve(
                to: CGPoint(x: 14.05, y: 8.077), control1: CGPoint(x: 14.29, y: 8.027),
                control2: CGPoint(x: 14.15, y: 8.055))
            p.addCurve(
                to: CGPoint(x: 7.462, y: 12.43), control1: CGPoint(x: 13.91, y: 8.108),
                control2: CGPoint(x: 11.72, y: 9.56))
            p.addCurve(
                to: CGPoint(x: 5.768, y: 13.06), control1: CGPoint(x: 6.839, y: 12.86),
                control2: CGPoint(x: 6.275, y: 13.07))
            p.addCurve(
                to: CGPoint(x: 3.339, y: 12.48), control1: CGPoint(x: 5.211, y: 13.05),
                control2: CGPoint(x: 4.137, y: 12.74))
            p.addCurve(
                to: CGPoint(x: 1.652, y: 11.46), control1: CGPoint(x: 2.362, y: 12.17),
                control2: CGPoint(x: 1.583, y: 12))
            p.addCurve(
                to: CGPoint(x: 2.814, y: 10.59), control1: CGPoint(x: 1.686, y: 11.18),
                control2: CGPoint(x: 2.074, y: 10.89))
            p.closeSubpath()
        }
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }
}

/// Часть «G» Google, цвет red.
struct GoogleGRed: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 48, rect.height / 48)
        let path = Path { p in
            p.move(to: CGPoint(x: 24, y: 9.5))
            p.addCurve(
                to: CGPoint(x: 33.21, y: 13.1), control1: CGPoint(x: 27.54, y: 9.5),
                control2: CGPoint(x: 30.71, y: 10.72))
            p.addLine(to: CGPoint(x: 40.06, y: 6.25))
            p.addCurve(to: CGPoint(x: 24, y: 0), control1: CGPoint(x: 35.9, y: 2.38), control2: CGPoint(x: 30.47, y: 0))
            p.addCurve(
                to: CGPoint(x: 2.56, y: 13.22), control1: CGPoint(x: 14.62, y: 0), control2: CGPoint(x: 6.51, y: 5.38))
            p.addLine(to: CGPoint(x: 10.54, y: 19.41))
            p.addCurve(
                to: CGPoint(x: 24, y: 9.5), control1: CGPoint(x: 12.43, y: 13.72), control2: CGPoint(x: 17.74, y: 9.5))
            p.closeSubpath()
        }
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }
}

/// Часть «G» Google, цвет blue.
struct GoogleGBlue: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 48, rect.height / 48)
        let path = Path { p in
            p.move(to: CGPoint(x: 46.98, y: 24.55))
            p.addCurve(
                to: CGPoint(x: 46.6, y: 20), control1: CGPoint(x: 46.98, y: 22.98),
                control2: CGPoint(x: 46.83, y: 21.46))
            p.addLine(to: CGPoint(x: 24, y: 20))
            p.addLine(to: CGPoint(x: 24, y: 29.02))
            p.addLine(to: CGPoint(x: 36.94, y: 29.02))
            p.addCurve(
                to: CGPoint(x: 32.16, y: 36.2), control1: CGPoint(x: 36.36, y: 31.98),
                control2: CGPoint(x: 34.68, y: 34.5))
            p.addLine(to: CGPoint(x: 39.89, y: 42.2))
            p.addCurve(
                to: CGPoint(x: 46.98, y: 24.55), control1: CGPoint(x: 44.4, y: 38.02),
                control2: CGPoint(x: 46.98, y: 31.84))
            p.closeSubpath()
        }
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }
}

/// Часть «G» Google, цвет yellow.
struct GoogleGYellow: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 48, rect.height / 48)
        let path = Path { p in
            p.move(to: CGPoint(x: 10.53, y: 28.59))
            p.addCurve(
                to: CGPoint(x: 9.77, y: 24), control1: CGPoint(x: 10.05, y: 27.14), control2: CGPoint(x: 9.77, y: 25.6))
            p.addCurve(
                to: CGPoint(x: 10.53, y: 19.41), control1: CGPoint(x: 9.77, y: 22.4),
                control2: CGPoint(x: 10.04, y: 20.86))
            p.addLine(to: CGPoint(x: 2.55, y: 13.22))
            p.addCurve(
                to: CGPoint(x: 0, y: 24), control1: CGPoint(x: 0.92, y: 16.46), control2: CGPoint(x: 0, y: 20.12))
            p.addCurve(
                to: CGPoint(x: 2.56, y: 34.78), control1: CGPoint(x: 0, y: 27.88), control2: CGPoint(x: 0.92, y: 31.54))
            p.addLine(to: CGPoint(x: 10.53, y: 28.59))
            p.closeSubpath()
        }
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }
}

/// Часть «G» Google, цвет green.
struct GoogleGGreen: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 48, rect.height / 48)
        let path = Path { p in
            p.move(to: CGPoint(x: 24, y: 48))
            p.addCurve(
                to: CGPoint(x: 39.89, y: 42.19), control1: CGPoint(x: 30.48, y: 48),
                control2: CGPoint(x: 35.93, y: 45.87))
            p.addLine(to: CGPoint(x: 32.16, y: 36.19))
            p.addCurve(
                to: CGPoint(x: 24, y: 38.49), control1: CGPoint(x: 30.01, y: 37.64),
                control2: CGPoint(x: 27.24, y: 38.49))
            p.addCurve(
                to: CGPoint(x: 10.53, y: 28.58), control1: CGPoint(x: 17.74, y: 38.49),
                control2: CGPoint(x: 12.43, y: 34.27))
            p.addLine(to: CGPoint(x: 2.55, y: 34.77))
            p.addCurve(
                to: CGPoint(x: 24, y: 48), control1: CGPoint(x: 6.51, y: 42.62), control2: CGPoint(x: 14.62, y: 48))
            p.closeSubpath()
        }
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }
}

/// Цветная «G» Google — цвета самой Google, не наши токены (правила Google Identity).
struct GoogleGLogo: View {
    var body: some View {
        ZStack {
            GoogleGRed().fill(Color(red: 0xEA / 255, green: 0x43 / 255, blue: 0x35 / 255))
            GoogleGBlue().fill(Color(red: 0x42 / 255, green: 0x85 / 255, blue: 0xF4 / 255))
            GoogleGYellow().fill(Color(red: 0xFB / 255, green: 0xBC / 255, blue: 0x05 / 255))
            GoogleGGreen().fill(Color(red: 0x34 / 255, green: 0xA8 / 255, blue: 0x53 / 255))
        }
    }
}
